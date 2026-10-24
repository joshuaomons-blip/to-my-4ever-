import request from 'supertest';
import { totp } from '../src/common/totp';
import { Client, TestCtx, enableMfa, registerAndLogin, setupApp, uniqueEmail } from './helpers';

describe('authentication', () => {
  let ctx: TestCtx;
  beforeAll(async () => (ctx = await setupApp()));
  afterAll(async () => ctx.close());

  it('registers, verifies email, logs in and reads the session', async () => {
    const c = await registerAndLogin(ctx);
    const s = await c.get('/v1/auth/session').expect(200);
    expect(s.body.user.email).toBe(c.email);
    expect(s.body.user.emailVerified).toBe(true);
    expect(s.body.operatingMode).toBe('sandbox');
  });

  it('does not reveal whether an email is already registered', async () => {
    const c = await registerAndLogin(ctx);
    const again = await request(ctx.app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: c.email, password: 'another-long-password-1', displayName: 'X', residenceCountry: 'GB' })
      .expect(202);
    expect(again.body).toEqual({ status: 'verification_email_sent' });
  });

  it('rejects weak passwords and unverified logins', async () => {
    const http = request(ctx.app.getHttpServer());
    await http.post('/v1/auth/register').send({ email: uniqueEmail(), password: 'short', displayName: 'X', residenceCountry: 'GB' }).expect(400);
    const email = uniqueEmail();
    await http.post('/v1/auth/register').send({ email, password: 'a-very-long-password-1', displayName: 'X', residenceCountry: 'GB' }).expect(202);
    const r = await http.post('/v1/auth/login').send({ email, password: 'a-very-long-password-1' }).expect(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('locks the account after repeated failed logins', async () => {
    const c = await registerAndLogin(ctx);
    const http = request(ctx.app.getHttpServer());
    for (let i = 0; i < 5; i++) await http.post('/v1/auth/login').send({ email: c.email, password: 'wrong-password-xx' }).expect(401);
    const r = await http.post('/v1/auth/login').send({ email: c.email, password: c.password }).expect(423);
    expect(r.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('requires a CSRF token on mutating requests', async () => {
    const c = await registerAndLogin(ctx);
    const r = await c.agent.post('/v1/auth/mfa/setup').send({}).expect(403);
    expect(r.body.error.code).toBe('CSRF_FAILED');
    await c.agent.post('/v1/auth/mfa/setup').set('x-csrf-token', 'forged').send({}).expect(403);
  });

  it('enforces MFA at login once enabled, with replay protection and recovery codes', async () => {
    const c = await registerAndLogin(ctx);
    const recovery = await enableMfa(c);
    expect(recovery).toHaveLength(10);
    await c.post('/v1/auth/logout').expect(200);

    const c2 = new Client(ctx, c.email, c.password);
    c2.totpSecret = c.totpSecret;
    const login = await c2.agent.post('/v1/auth/login').send({ email: c.email, password: c.password }).expect(200);
    expect(login.body.mfaRequired).toBe(true);
    c2.csrf = login.body.csrfToken;
    const blocked = await c2.get('/v1/onboarding').expect(401);
    expect(blocked.body.error.code).toBe('MFA_REQUIRED');
    await c2.post('/v1/auth/mfa/verify', { code: '000000' }).expect(400);
    const code = totp(c.totpSecret, Date.now() + 30_000);
    await c2.post('/v1/auth/mfa/verify', { code }).expect(200);
    await c2.get('/v1/onboarding').expect(200);
    // Same code cannot be replayed for step-up.
    await c2.post('/v1/auth/step-up', { code }).expect(400);

    // Recovery code works exactly once.
    const c3 = new Client(ctx, c.email, c.password);
    const l3 = await c3.agent.post('/v1/auth/login').send({ email: c.email, password: c.password }).expect(200);
    c3.csrf = l3.body.csrfToken;
    await c3.post('/v1/auth/mfa/verify', { recoveryCode: recovery[0] }).expect(200);
    const c4 = new Client(ctx, c.email, c.password);
    const l4 = await c4.agent.post('/v1/auth/login').send({ email: c.email, password: c.password }).expect(200);
    c4.csrf = l4.body.csrfToken;
    await c4.post('/v1/auth/mfa/verify', { recoveryCode: recovery[0] }).expect(400);
  });

  it('resets a password via emailed token and revokes existing sessions', async () => {
    const c = await registerAndLogin(ctx);
    const http = request(ctx.app.getHttpServer());
    await http.post('/v1/auth/password/forgot').send({ email: c.email }).expect(202);
    const mail = await ctx.db.one<{ body: string }>("SELECT body FROM outbound_emails WHERE to_address = $1 AND template = 'password_reset' ORDER BY id DESC LIMIT 1", [c.email]);
    const token = mail!.body.match(/token=([\w-]+)/)![1]!;
    await http.post('/v1/auth/password/reset').send({ token, password: 'brand-new-password-42' }).expect(200);
    await c.get('/v1/auth/session').expect(401);
    await http.post('/v1/auth/password/reset').send({ token, password: 'brand-new-password-43' }).expect(400);
    await http.post('/v1/auth/login').send({ email: c.email, password: 'brand-new-password-42' }).expect(200);
  });

  it('writes a hash-chained audit trail that cannot be altered', async () => {
    const rows = await ctx.db.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_log WHERE action = 'auth.login'");
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
    await expect(ctx.db.query('UPDATE audit_log SET action = $1', ['tampered'])).rejects.toThrow(/append-only/);
    await expect(ctx.db.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });
});
