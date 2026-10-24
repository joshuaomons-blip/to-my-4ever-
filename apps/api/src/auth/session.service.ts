import { Inject, Injectable } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DbService, Queryable } from '../database/db.service';
import { randomToken, sha256 } from '../common/crypto';
import { AppRequest, clientMeta } from '../common/request-context';

export type SubjectType = 'customer' | 'staff';

export function cookieNames(cfg: AppConfig, subject: SubjectType) {
  // __Host- prefix (Secure, Path=/, no Domain) when cookies are secure.
  const p = cfg.cookieSecure ? '__Host-' : '';
  return subject === 'customer'
    ? { session: `${p}aur_sid`, csrf: `${p}aur_csrf` }
    : { session: `${p}aur_staff_sid`, csrf: `${p}aur_staff_csrf` };
}

interface SessionRow {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  csrf_token_hash: Buffer;
  mfa_required: boolean;
  mfa_verified_at: Date | null;
  step_up_at: Date | null;
  idle_expires_at: Date;
  absolute_expires_at: Date;
}

@Injectable()
export class SessionService {
  constructor(private readonly db: DbService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  private ttl(subject: SubjectType) {
    return subject === 'customer'
      ? { idle: this.cfg.session.idleMinutes, abs: this.cfg.session.absoluteHours }
      : { idle: this.cfg.session.staffIdleMinutes, abs: this.cfg.session.staffAbsoluteHours };
  }

  async create(
    q: Queryable,
    subject: SubjectType,
    subjectId: string,
    mfaRequired: boolean,
    req: AppRequest,
  ): Promise<{ token: string; csrfToken: string; sessionId: string }> {
    const token = randomToken();
    const csrfToken = randomToken();
    const { idle, abs } = this.ttl(subject);
    const meta = clientMeta(req);
    const res = await q.query<{ id: string }>(
      `INSERT INTO sessions (subject_type, subject_id, token_hash, csrf_token_hash, mfa_required, ip, user_agent,
                             idle_expires_at, absolute_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(mins => $8), now() + make_interval(hours => $9))
       RETURNING id`,
      [subject, subjectId, sha256(token), sha256(csrfToken), mfaRequired, meta.ip, meta.userAgent, idle, abs],
    );
    return { token, csrfToken, sessionId: res.rows[0]!.id };
  }

  setCookies(res: Response, subject: SubjectType, token: string, csrfToken: string): void {
    const names = cookieNames(this.cfg, subject);
    const base = {
      secure: this.cfg.cookieSecure,
      sameSite: (subject === 'staff' ? 'strict' : 'lax') as 'strict' | 'lax',
      path: '/',
      maxAge: this.ttl(subject).abs * 3600 * 1000,
    };
    res.cookie(names.session, token, { ...base, httpOnly: true });
    // Readable by the SPA so it can echo it in X-CSRF-Token (double-submit bound to the session).
    res.cookie(names.csrf, csrfToken, { ...base, httpOnly: false });
  }

  clearCookies(res: Response, subject: SubjectType): void {
    const names = cookieNames(this.cfg, subject);
    res.clearCookie(names.session, { path: '/' });
    res.clearCookie(names.csrf, { path: '/' });
  }

  async resolve(token: string, subject: SubjectType): Promise<SessionRow | undefined> {
    const s = await this.db.one<SessionRow>(
      `UPDATE sessions
          SET last_seen_at = now(),
              idle_expires_at = LEAST(absolute_expires_at, now() + make_interval(mins => $3))
        WHERE token_hash = $1 AND subject_type = $2 AND revoked_at IS NULL
          AND idle_expires_at > now() AND absolute_expires_at > now()
        RETURNING id, subject_type, subject_id, csrf_token_hash, mfa_required, mfa_verified_at, step_up_at,
                  idle_expires_at, absolute_expires_at`,
      [sha256(token), subject, this.ttl(subject).idle],
    );
    return s;
  }

  async markMfaVerified(sessionId: string): Promise<void> {
    await this.db.query('UPDATE sessions SET mfa_verified_at = now(), step_up_at = now() WHERE id = $1', [sessionId]);
  }

  async markStepUp(sessionId: string): Promise<void> {
    await this.db.query('UPDATE sessions SET step_up_at = now() WHERE id = $1', [sessionId]);
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.db.query('UPDATE sessions SET revoked_at = now(), revoke_reason = $2 WHERE id = $1 AND revoked_at IS NULL', [
      sessionId,
      reason,
    ]);
  }

  async revokeAll(q: Queryable, subject: SubjectType, subjectId: string, reason: string, exceptSessionId?: string): Promise<void> {
    await q.query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = $3
        WHERE subject_type = $1 AND subject_id = $2 AND revoked_at IS NULL AND ($4::uuid IS NULL OR id <> $4)`,
      [subject, subjectId, reason, exceptSessionId ?? null],
    );
  }
}

/** Attaches req.auth from the session cookie. Authorization is enforced by guards. */
export function sessionMiddleware(sessions: SessionService, cfg: AppConfig) {
  return async (req: AppRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // originalUrl: req.path is rewritten relative to the middleware mount point.
      const isAdminPath = (req.originalUrl ?? req.url).startsWith('/v1/admin');
      const subject: SubjectType = isAdminPath ? 'staff' : 'customer';
      const token = (req.cookies as Record<string, string> | undefined)?.[cookieNames(cfg, subject).session];
      if (token) {
        const s = await sessions.resolve(token, subject);
        if (s) {
          const csrfHeader = req.header('x-csrf-token');
          const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
          if (mutating && (!csrfHeader || !sha256(csrfHeader).equals(s.csrf_token_hash))) {
            // A mutating request with a session but no valid CSRF token is treated as unauthenticated.
            (req as AppRequest & { csrfFailed?: boolean }).csrfFailed = true;
          } else {
            req.auth = {
              sessionId: s.id,
              subjectType: s.subject_type,
              subjectId: s.subject_id,
              mfaRequired: s.mfa_required,
              mfaVerified: !s.mfa_required || s.mfa_verified_at !== null,
              stepUpAt: s.step_up_at,
              roles: [],
            };
          }
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
