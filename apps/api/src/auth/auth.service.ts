import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuditService } from '../common/audit.service';
import { randomToken, sha256 } from '../common/crypto';
import { AppError } from '../common/errors';
import { AppRequest } from '../common/request-context';
import { DbService } from '../database/db.service';
import { MailerService } from '../notifications/mailer.service';
import { DUMMY_HASH_PROMISE, assertPasswordPolicy, hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  residenceCountry: string | null;
  baseCurrency: string;
  status: string;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  email_verified_at: Date | null;
  mfa_enabled: boolean;
  residence_country: string | null;
  base_currency: string;
  status: string;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | null;
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  emailVerified: !!u.email_verified_at,
  mfaEnabled: u.mfa_enabled,
  residenceCountry: u.residence_country,
  baseCurrency: u.base_currency,
  status: u.status,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async getUser(id: string): Promise<UserRow> {
    const u = await this.db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    if (!u) throw new AppError('UNAUTHENTICATED', 'Account not found', 401);
    return u;
  }

  /** Always resolves the same way whether or not the email exists (prevents account enumeration). */
  async register(input: { email: string; password: string; displayName: string; residenceCountry: string }, req: AppRequest) {
    const email = input.email.trim().toLowerCase();
    assertPasswordPolicy(input.password, email);
    const country = await this.db.one<{ code: string }>('SELECT code FROM jurisdictions WHERE code = $1', [input.residenceCountry]);
    if (!country) throw new AppError('UNKNOWN_COUNTRY', 'Unsupported country code', 400);
    const existing = await this.db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      await this.mailer.send({
        to: email,
        template: 'account_exists',
        subject: 'Sign-in attempt for your Aureon Capital account',
        body: 'Someone tried to register with this email. If this was you, sign in or reset your password instead.',
      });
      await this.audit.record({ actorType: 'anonymous', action: 'auth.register.duplicate', targetType: 'user', targetId: existing.id, req });
      return;
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.db.tx(async (c) => {
      const u = (
        await c.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, residence_country) VALUES ($1,$2,$3,$4) RETURNING id`,
          [email, passwordHash, input.displayName.trim(), input.residenceCountry],
        )
      ).rows[0]!;
      await this.audit.record({ actorType: 'customer', actorId: u.id, action: 'auth.register', targetType: 'user', targetId: u.id, req }, c);
      return u;
    });
    if (this.cfg.sandboxAutoVerifyEmail) {
      // Sandbox hosting without an email provider: mark verified instead of sending a link (refused in live mode).
      await this.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [user.id]);
      await this.audit.record({ actorType: 'system', action: 'auth.email_auto_verified_sandbox', targetType: 'user', targetId: user.id, req });
      return;
    }
    await this.sendEmailToken(user.id, email, 'verify_email');
  }

  async sendEmailToken(userId: string, email: string, purpose: 'verify_email' | 'password_reset'): Promise<void> {
    const token = randomToken();
    const ttlMinutes = purpose === 'verify_email' ? 24 * 60 : 30;
    await this.db.query(
      `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(mins => $4))`,
      [userId, purpose, sha256(token), ttlMinutes],
    );
    const path = purpose === 'verify_email' ? 'verify-email' : 'reset-password';
    await this.mailer.send({
      to: email,
      template: purpose,
      subject: purpose === 'verify_email' ? 'Verify your email address' : 'Reset your password',
      body: `${this.cfg.webOrigin}/${path}?token=${token}\n\nThis link expires in ${ttlMinutes} minutes.`,
    });
  }

  private async consumeToken(token: string, purpose: 'verify_email' | 'password_reset'): Promise<string> {
    const row = await this.db.one<{ user_id: string }>(
      `UPDATE email_tokens SET used_at = now()
        WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [sha256(token), purpose],
    );
    if (!row) throw new AppError('INVALID_TOKEN', 'This link is invalid or has expired', 400);
    return row.user_id;
  }

  async verifyEmail(token: string, req: AppRequest): Promise<void> {
    const userId = await this.consumeToken(token, 'verify_email');
    await this.db.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [userId]);
    await this.audit.record({ actorType: 'customer', actorId: userId, action: 'auth.email_verified', targetType: 'user', targetId: userId, req });
  }

  async resendVerification(email: string): Promise<void> {
    const u = await this.db.one<{ id: string; email_verified_at: Date | null }>(
      'SELECT id, email_verified_at FROM users WHERE email = $1',
      [email.trim().toLowerCase()],
    );
    if (u && !u.email_verified_at) await this.sendEmailToken(u.id, email.trim().toLowerCase(), 'verify_email');
  }

  async login(email: string, password: string, req: AppRequest) {
    const u = await this.db.one<UserRow>('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!u) {
      await verifyPassword(await DUMMY_HASH_PROMISE, password);
      await this.audit.record({ actorType: 'anonymous', action: 'auth.login', outcome: 'failure', metadata: { reason: 'unknown_email' }, req });
      throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
    }
    if (u.locked_until && u.locked_until > new Date()) {
      await this.audit.record({ actorType: 'customer', actorId: u.id, action: 'auth.login', outcome: 'denied', metadata: { reason: 'locked' }, req });
      throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later or reset your password.', 423);
    }
    const ok = await verifyPassword(u.password_hash, password);
    if (!ok) {
      // Atomic increment; on reaching the threshold, lock and reset the counter.
      const r = await this.db.one<{ failed: number }>(
        `UPDATE users
            SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
                locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
          WHERE id = $1
          RETURNING failed_login_count + CASE WHEN failed_login_count = 0 THEN $2 ELSE 0 END AS failed`,
        [u.id, MAX_FAILED, LOCK_MINUTES],
      );
      const failed = r?.failed ?? 0;
      await this.audit.record({ actorType: 'customer', actorId: u.id, action: 'auth.login', outcome: 'failure', metadata: { reason: 'bad_password', failed }, req });
      throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
    }
    if (u.status !== 'active') {
      await this.audit.record({ actorType: 'customer', actorId: u.id, action: 'auth.login', outcome: 'denied', metadata: { reason: u.status }, req });
      throw new AppError('ACCOUNT_DISABLED', 'This account is not active. Please contact support.', 403);
    }
    if (!u.email_verified_at) throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email address first', 403);
    await this.db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [u.id]);
    const session = await this.sessions.create(this.db.pool, 'customer', u.id, u.mfa_enabled, req);
    await this.audit.record({ actorType: 'customer', actorId: u.id, action: 'auth.login', metadata: { mfaPending: u.mfa_enabled }, req });
    return { session, user: toPublicUser(u), mfaRequired: u.mfa_enabled };
  }

  async forgotPassword(email: string): Promise<void> {
    const u = await this.db.one<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (u) await this.sendEmailToken(u.id, u.email, 'password_reset');
  }

  async resetPassword(token: string, password: string, req: AppRequest): Promise<void> {
    const userId = await this.consumeToken(token, 'password_reset');
    const u = await this.getUser(userId);
    assertPasswordPolicy(password, u.email);
    const h = await hashPassword(password);
    await this.db.tx(async (c) => {
      await c.query(
        'UPDATE users SET password_hash = $2, password_changed_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = $1',
        [userId, h],
      );
      await this.sessions.revokeAll(c, 'customer', userId, 'password_reset');
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'auth.password_reset', targetType: 'user', targetId: userId, req }, c);
    });
    await this.mailer.send({ to: u.email, template: 'password_changed', subject: 'Your password was changed', body: 'If this was not you, contact support immediately.' });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, req: AppRequest): Promise<void> {
    const u = await this.getUser(userId);
    if (!(await verifyPassword(u.password_hash, current))) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect', 400);
    }
    assertPasswordPolicy(next, u.email);
    const h = await hashPassword(next);
    await this.db.tx(async (c) => {
      await c.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [userId, h]);
      await this.sessions.revokeAll(c, 'customer', userId, 'password_changed', sessionId);
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'auth.password_changed', targetType: 'user', targetId: userId, req }, c);
    });
  }
}
