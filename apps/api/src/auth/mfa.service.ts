import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DbService } from '../database/db.service';
import { RedisService } from '../redis/redis.service';
import { decryptField, encryptField, randomToken, sha256Hex } from '../common/crypto';
import { AppError } from '../common/errors';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../common/totp';

type Table = 'users' | 'staff_users';

@Injectable()
export class MfaService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async beginSetup(table: Table, id: string, email: string): Promise<{ secret: string; otpauthUri: string }> {
    const secret = generateTotpSecret();
    await this.db.query(`UPDATE ${table} SET mfa_pending_secret_enc = $2 WHERE id = $1`, [
      id,
      encryptField(this.cfg.encryptionKey, secret, `${table}:${id}:mfa`),
    ]);
    return { secret, otpauthUri: otpauthUri(secret, email, table === 'users' ? 'Aureon Capital' : 'Aureon Admin') };
  }

  /** Confirms the pending secret and activates MFA. Returns one-time recovery codes for customers. */
  async confirmSetup(table: Table, id: string, code: string): Promise<string[]> {
    const row = await this.db.one<{ mfa_pending_secret_enc: string | null }>(
      `SELECT mfa_pending_secret_enc FROM ${table} WHERE id = $1`,
      [id],
    );
    if (!row?.mfa_pending_secret_enc) throw new AppError('MFA_SETUP_NOT_STARTED', 'Start MFA setup first', 400);
    const secret = decryptField(this.cfg.encryptionKey, row.mfa_pending_secret_enc, `${table}:${id}:mfa`);
    if (verifyTotp(secret, code) === null) throw new AppError('INVALID_MFA_CODE', 'The code is incorrect or expired', 400);
    const codes = Array.from({ length: 10 }, () => randomToken(6).replace(/[-_]/g, 'x').slice(0, 10).toUpperCase());
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE ${table} SET mfa_secret_enc = $2, mfa_pending_secret_enc = NULL, mfa_enabled = true WHERE id = $1`,
        [id, encryptField(this.cfg.encryptionKey, secret, `${table}:${id}:mfa`)],
      );
      if (table === 'users') {
        await c.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [id]);
        for (const rc of codes) {
          await c.query('INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1,$2)', [id, sha256Hex(rc)]);
        }
      }
    });
    return table === 'users' ? codes : [];
  }

  /** Verifies a TOTP code with replay protection (each time-step usable once). */
  async verify(table: Table, id: string, code: string): Promise<boolean> {
    const row = await this.db.one<{ mfa_secret_enc: string | null; mfa_enabled: boolean }>(
      `SELECT mfa_secret_enc, mfa_enabled FROM ${table} WHERE id = $1`,
      [id],
    );
    if (!row?.mfa_enabled || !row.mfa_secret_enc) return false;
    const secret = decryptField(this.cfg.encryptionKey, row.mfa_secret_enc, `${table}:${id}:mfa`);
    const step = verifyTotp(secret, code);
    if (step === null) return false;
    const fresh = await this.redis.client.set(`totp:used:${table}:${id}:${step}`, '1', 'EX', 120, 'NX').catch(() => {
      throw new AppError('SERVICE_UNAVAILABLE', 'Verification temporarily unavailable', 503);
    });
    return fresh === 'OK';
  }

  async useRecoveryCode(userId: string, code: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE user_recovery_codes SET used_at = now()
        WHERE id = (SELECT id FROM user_recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL LIMIT 1)
        RETURNING id`,
      [userId, sha256Hex(code.trim().toUpperCase())],
    );
    return res.length === 1;
  }

  async disable(userId: string): Promise<void> {
    await this.db.tx(async (c) => {
      await c.query('UPDATE users SET mfa_enabled = false, mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL WHERE id = $1', [userId]);
      await c.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
    });
  }
}
