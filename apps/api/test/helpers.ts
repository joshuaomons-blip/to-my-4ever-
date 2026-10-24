import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { BROKER_ADAPTER } from '../src/brokerage/broker-adapter';
import { SandboxBrokerAdapter } from '../src/brokerage/sandbox-broker.adapter';
import { totp } from '../src/common/totp';
import { DbService } from '../src/database/db.service';
import { JobsService } from '../src/jobs/jobs.service';
import { RedisService } from '../src/redis/redis.service';

export interface TestCtx {
  app: INestApplication;
  db: DbService;
  jobs: JobsService;
  broker: SandboxBrokerAdapter;
  redis: RedisService;
  close: () => Promise<void>;
}

export async function setupApp(): Promise<TestCtx> {
  const app = await createApp({ logger: false });
  await app.init();
  const ctx: TestCtx = {
    app,
    db: app.get(DbService),
    jobs: app.get(JobsService),
    broker: app.get(BROKER_ADAPTER) as SandboxBrokerAdapter,
    redis: app.get(RedisService),
    close: () => app.close(),
  };
  return ctx;
}

/** A logged-in HTTP client with cookie jar + CSRF header + TOTP helper. */
export class Client {
  agent: ReturnType<typeof request.agent>;
  csrf = '';
  totpSecret = '';
  userId = '';
  private stepOffset = 0;

  constructor(readonly ctx: TestCtx, readonly email: string, readonly password = 'correct-horse-battery-9') {
    this.agent = request.agent(ctx.app.getHttpServer());
  }

  /** Each call returns a code for a distinct time-step (avoids TOTP replay protection in fast tests). */
  code(): string {
    const c = totp(this.totpSecret, Date.now() + this.stepOffset * 30_000);
    this.stepOffset = this.stepOffset >= 1 ? -1 : this.stepOffset + 1;
    return c;
  }

  get(path: string) {
    return this.agent.get(path);
  }
  post(path: string, body?: object, headers: Record<string, string> = {}) {
    return this.agent.post(path).set('x-csrf-token', this.csrf).set(headers).send(body ?? {});
  }
  put(path: string, body?: object) {
    return this.agent.put(path).set('x-csrf-token', this.csrf).send(body ?? {});
  }
  idem(path: string, body: object, key = randomUUID()) {
    return this.post(path, body, { 'idempotency-key': key });
  }
}

export const uniqueEmail = (tag = 'user') => `${tag}-${randomUUID().slice(0, 8)}@example.test`;

export async function registerAndLogin(ctx: TestCtx, opts: { country?: string } = {}): Promise<Client> {
  const c = new Client(ctx, uniqueEmail());
  await c.agent.post('/v1/auth/register').send({ email: c.email, password: c.password, displayName: 'Test User', residenceCountry: opts.country ?? 'GB' }).expect(202);
  const mail = await ctx.db.one<{ body: string }>("SELECT body FROM outbound_emails WHERE to_address = $1 AND template = 'verify_email' ORDER BY id DESC LIMIT 1", [c.email]);
  const token = mail!.body.match(/token=([\w-]+)/)![1]!;
  await c.agent.post('/v1/auth/verify-email').send({ token }).expect(200);
  const login = await c.agent.post('/v1/auth/login').send({ email: c.email, password: c.password }).expect(200);
  c.csrf = login.body.csrfToken;
  c.userId = login.body.user.id;
  return c;
}

export async function enableMfa(c: Client): Promise<string[]> {
  const setup = await c.post('/v1/auth/mfa/setup').expect(200);
  c.totpSecret = setup.body.secret;
  const en = await c.post('/v1/auth/mfa/enable', { code: totp(c.totpSecret) }).expect(200);
  return en.body.recoveryCodes;
}

export const PROFILE = {
  legalFirstName: 'Ada',
  legalLastName: 'Lovelace',
  dateOfBirth: '1990-04-12',
  nationality: 'GB',
  residenceCountry: 'GB',
  addressLine1: '1 Test Street',
  city: 'London',
  postalCode: 'SW1A 1AA',
  phone: '+447700900123',
  taxId: 'QQ123456C',
  employmentStatus: 'employed',
  annualIncomeBand: '50k-100k',
  netWorthBand: '100k-500k',
  investmentExperience: 'good',
  riskTolerance: 'moderate',
  fundingSource: 'employment_income',
  isPoliticallyExposed: false,
  isControlPerson: false,
  isAffiliatedExchange: false,
};

export async function acceptAllDocs(c: Client) {
  const s = await c.get('/v1/onboarding').expect(200);
  await c.post('/v1/onboarding/disclosures', { documents: s.body.documents.map((d: { key: string; version: string }) => ({ key: d.key, version: d.version })) }).expect(200);
}

/** Full happy path to an active, funded brokerage account. */
export async function onboardedCustomer(ctx: TestCtx, opts: { profile?: Partial<typeof PROFILE>; fund?: string } = {}): Promise<Client> {
  const c = await registerAndLogin(ctx, { country: opts.profile?.residenceCountry ?? 'GB' });
  await enableMfa(c);
  await c.put('/v1/onboarding/profile', { ...PROFILE, ...opts.profile }).expect(200);
  await acceptAllDocs(c);
  await c.post('/v1/onboarding/submit').expect(200);
  await ctx.jobs.drain();
  if (opts.fund) await fund(c, opts.fund);
  return c;
}

export async function stepUp(c: Client) {
  await c.post('/v1/auth/step-up', { code: c.code() }).expect(200);
}

export async function addMethod(c: Client): Promise<string> {
  await stepUp(c);
  const r = await c.post('/v1/funding/methods', { type: 'bank_account', label: 'Test Bank', last4: '6789', currency: 'USD' }).expect(201);
  return r.body.id;
}

export async function fund(c: Client, amount: string): Promise<{ methodId: string; depositId: string }> {
  const methodId = (await c.ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1 LIMIT 1', [c.userId]))?.id ?? (await addMethod(c));
  const d = await c.idem('/v1/funding/deposits', { amount, currency: 'USD', paymentMethodId: methodId }).expect(201);
  await c.ctx.jobs.drain();
  return { methodId, depositId: d.body.id };
}

export async function balances(c: Client) {
  const r = await c.get('/v1/portfolio').expect(200);
  return r.body.cash as { available: string; pending: string; held: string; unsettled: string; withdrawalHold: string; total: string };
}
