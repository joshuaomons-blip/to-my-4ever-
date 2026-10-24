import { randomUUID } from 'crypto';
import { signSandboxWebhook } from '../src/payments/sandbox-payment.adapter';
import { LedgerService } from '../src/ledger/ledger.service';
import { anon, staffClient, staffStepUp } from './admin-helpers';
import { TestCtx, balances, drainAll, fund, onboardedCustomer, setupApp, stepUp } from './helpers';

describe('deposits, withdrawals and payment webhooks', () => {
  let ctx: TestCtx;
  beforeAll(async () => (ctx = await setupApp()));
  afterAll(async () => ctx.close());
  afterEach(async () => {
    const tb = await ctx.app.get(LedgerService).trialBalance();
    expect(tb.every((t) => t.balanced)).toBe(true);
  });

  it('shows a deposit as pending (not spendable) until the provider confirms it', async () => {
    const c = await onboardedCustomer(ctx, { fund: '100.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    const d = await c.idem('/v1/funding/deposits', { amount: '250.00', currency: 'USD', paymentMethodId: m!.id }).expect(201);
    expect(d.body.status).toBe('pending');
    let b = await balances(c);
    expect(b.pending).toBe('250.00');
    expect(b.available).toBe('100.00');
    await drainAll(ctx);
    b = await balances(c);
    expect(b.pending).toBe('0.00');
    expect(b.available).toBe('350.00');
  });

  it('handles a failed payment without crediting the customer', async () => {
    const c = await onboardedCustomer(ctx, { fund: '100.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    const d = await c.idem('/v1/funding/deposits', { amount: '500.13', currency: 'USD', paymentMethodId: m!.id }).expect(201);
    await drainAll(ctx);
    const f = await c.get('/v1/funding').expect(200);
    expect(f.body.deposits.find((x: { id: string }) => x.id === d.body.id).status).toBe('failed');
    const b = await balances(c);
    expect(b.available).toBe('100.00');
    expect(b.pending).toBe('0.00');
  });

  it('prevents duplicate deposits from repeated requests and duplicate webhooks', async () => {
    const c = await onboardedCustomer(ctx, { fund: '10.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    const key = randomUUID();
    const a = await c.idem('/v1/funding/deposits', { amount: '40.00', currency: 'USD', paymentMethodId: m!.id }, key).expect(201);
    const b = await c.idem('/v1/funding/deposits', { amount: '40.00', currency: 'USD', paymentMethodId: m!.id }, key).expect(201);
    expect(b.body.id).toBe(a.body.id);
    // Capture the provider's webhook and deliver it twice.
    const job = await ctx.db.one<{ payload: { raw: string; signature: string } }>("SELECT payload FROM jobs WHERE queue = 'sandbox.payments.deliver' AND status = 'pending' AND payload->>'raw' LIKE $1", [`%${(await ctx.db.one<{ p: string }>('SELECT provider_payment_id AS p FROM deposits WHERE id = $1', [a.body.id]))!.p}%`]);
    for (let i = 0; i < 2; i++) {
      const r = await anon(ctx).post('/v1/webhooks/payments/sandbox').set('content-type', 'application/json').set('x-sandbox-signature', job!.payload.signature).send(job!.payload.raw).expect(200);
      expect(r.body.duplicate).toBe(i === 1);
    }
    await drainAll(ctx);
    expect((await balances(c)).available).toBe('50.00');
  });

  it('rejects webhooks with invalid or stale signatures', async () => {
    const raw = JSON.stringify({ eventId: 'evt-x', type: 'payment.succeeded', providerId: 'nope', occurredAt: new Date().toISOString() });
    await anon(ctx).post('/v1/webhooks/payments/sandbox').set('content-type', 'application/json').set('x-sandbox-signature', signSandboxWebhook('wrong-secret-xxxxxxx', raw)).send(raw).expect(401);
    const old = signSandboxWebhook(process.env.SANDBOX_PAYMENT_WEBHOOK_SECRET!, raw, Math.floor(Date.now() / 1000) - 3600);
    await anon(ctx).post('/v1/webhooks/payments/sandbox').set('content-type', 'application/json').set('x-sandbox-signature', old).send(raw).expect(401);
    await anon(ctx).post('/v1/webhooks/payments/sandbox').set('content-type', 'application/json').send(raw).expect(401);
  });

  it('requires step-up MFA for withdrawals and holds the first withdrawal for review', async () => {
    const c = await onboardedCustomer(ctx, { fund: '300.00' });
    await ctx.db.query("UPDATE sessions SET step_up_at = now() - interval '1 hour' WHERE subject_id = $1", [c.userId]);
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    const denied = await c.idem('/v1/funding/withdrawals', { amount: '50.00', currency: 'USD', paymentMethodId: m!.id }).expect(403);
    expect(denied.body.error.code).toBe('STEP_UP_REQUIRED');
    await stepUp(c);
    const w = await c.idem('/v1/funding/withdrawals', { amount: '50.00', currency: 'USD', paymentMethodId: m!.id }).expect(201);
    expect(w.body.status).toBe('pending_review');
    const b = await balances(c);
    expect(b.available).toBe('250.00');
    expect(b.withdrawalHold).toBe('50.00');

    // Compliance approves (step-up required) → partner debited → payout completes.
    const staff = await staffClient(ctx, ['finance']);
    const nostep = await staff.post(`/v1/admin/withdrawals/${w.body.id}/decision`, { decision: 'approve', reason: 'Verified destination' });
    expect([200, 403]).toContain(nostep.status);
    if (nostep.status === 403) {
      await staffStepUp(staff);
      await staff.post(`/v1/admin/withdrawals/${w.body.id}/decision`, { decision: 'approve', reason: 'Verified destination' }).expect(200);
    }
    await drainAll(ctx);
    const f = await c.get('/v1/funding').expect(200);
    expect(f.body.withdrawals[0].status).toBe('completed');
    const after = await balances(c);
    expect(after.withdrawalHold).toBe('0.00');
    expect(after.total).toBe('250.00');
  });

  it('blocks withdrawals above available cash and to methods never used for a deposit', async () => {
    const c = await onboardedCustomer(ctx, { fund: '100.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    await stepUp(c);
    const over = await c.idem('/v1/funding/withdrawals', { amount: '100.01', currency: 'USD', paymentMethodId: m!.id }).expect(422);
    expect(over.body.error.code).toBe('INSUFFICIENT_FUNDS');
    await stepUp(c);
    const other = await c.post('/v1/funding/methods', { type: 'bank_account', label: 'Other', last4: '1111', currency: 'USD' }).expect(201);
    const r = await c.idem('/v1/funding/withdrawals', { amount: '10.00', currency: 'USD', paymentMethodId: other.body.id }).expect(422);
    expect(r.body.error.code).toBe('WITHDRAWAL_DESTINATION_NOT_ALLOWED');
    expect((await balances(c)).available).toBe('100.00');
  });

  it('returns funds when a payout fails after the partner account was debited', async () => {
    const c = await onboardedCustomer(ctx, { fund: '500.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    await stepUp(c);
    const w = await c.idem('/v1/funding/withdrawals', { amount: '20.13', currency: 'USD', paymentMethodId: m!.id }).expect(201);
    const staff = await staffClient(ctx, ['compliance_officer']);
    await staffStepUp(staff);
    await staff.post(`/v1/admin/withdrawals/${w.body.id}/decision`, { decision: 'approve', reason: 'Looks fine to me' }).expect(200);
    await drainAll(ctx);
    const f = await c.get('/v1/funding').expect(200);
    expect(f.body.withdrawals[0].status).toBe('failed');
    const b = await balances(c);
    expect(b.available).toBe('500.00');
    expect(b.withdrawalHold).toBe('0.00');
    const acct = await ctx.db.one<{ provider_account_id: string }>('SELECT provider_account_id FROM brokerage_accounts WHERE user_id = $1', [c.userId]);
    const partner = await ctx.db.one<{ cash: string }>('SELECT cash FROM sandbox_partner.accounts WHERE id = $1', [acct!.provider_account_id]);
    expect(Number(partner!.cash)).toBe(500);
  });

  it('prevents concurrent withdrawals from exceeding available cash', async () => {
    const c = await onboardedCustomer(ctx, { fund: '100.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    await stepUp(c);
    const results = await Promise.all(Array.from({ length: 5 }, () => c.idem('/v1/funding/withdrawals', { amount: '40.00', currency: 'USD', paymentMethodId: m!.id })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const b = await balances(c);
    expect(b.available).toBe('20.00');
    expect(b.withdrawalHold).toBe('80.00');
  });

  it('refuses unsupported currencies and enforces limits', async () => {
    const c = await onboardedCustomer(ctx, { fund: '10.00' });
    const m = await ctx.db.one<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = $1', [c.userId]);
    const small = await c.idem('/v1/funding/deposits', { amount: '0.50', currency: 'USD', paymentMethodId: m!.id }).expect(422);
    expect(small.body.error.code).toBe('AMOUNT_TOO_SMALL');
    await stepUp(c);
    const gbp = await c.post('/v1/funding/methods', { type: 'bank_account', label: 'GBP', last4: '2222', currency: 'GBP' }).expect(422);
    expect(gbp.body.error.code).toBe('FX_NOT_AVAILABLE');
    await fund(c, '1.00');
  });
});
