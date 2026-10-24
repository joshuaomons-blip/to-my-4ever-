import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { encryptField } from '../src/common/crypto';
import { generateTotpSecret } from '../src/common/totp';
import { Client, TestCtx, uniqueEmail } from './helpers';

/** Creates a staff member with MFA enrolled and returns a fully-authenticated client. */
export async function staffClient(ctx: TestCtx, roles: string[]): Promise<Client> {
  const email = uniqueEmail('staff');
  const password = 'staff-password-very-long-1';
  const secret = generateTotpSecret();
  const r = await ctx.db.one<{ id: string }>('INSERT INTO staff_users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id', [email, await hashPassword(password), 'Staff Member']);
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY!, 'base64');
  await ctx.db.query('UPDATE staff_users SET mfa_enabled = true, mfa_secret_enc = $2 WHERE id = $1', [r!.id, encryptField(key, secret, `staff_users:${r!.id}:mfa`)]);
  for (const role of roles) await ctx.db.query('INSERT INTO staff_roles (staff_id, role) VALUES ($1,$2)', [r!.id, role]);
  const c = new Client(ctx, email, password);
  c.totpSecret = secret;
  c.userId = r!.id;
  const login = await c.agent.post('/v1/admin/auth/login').send({ email, password }).expect(200);
  c.csrf = login.body.csrfToken;
  await c.post('/v1/admin/auth/mfa/verify', { code: c.code() }).expect(200);
  return c;
}

export async function staffStepUp(c: Client) {
  await c.post('/v1/admin/auth/step-up', { code: c.code() }).expect(200);
}

export const anon = (ctx: TestCtx) => request(ctx.app.getHttpServer());
