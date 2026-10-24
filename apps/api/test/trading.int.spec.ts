import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { OrdersService } from '../src/orders/orders.service';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { MKT, TestCtx, balances, drainAll, onboardedCustomer, registerAndLogin, setupApp } from './helpers';

describe('order lifecycle (sandbox partner)', () => {
  let ctx: TestCtx;
  beforeAll(async () => (ctx = await setupApp()));
  afterAll(async () => {
    await ctx.broker.setFault('outage', null);
    await ctx.close();
  });
  afterEach(async () => {
    // Ledger must balance after every scenario.
    const tb = await ctx.app.get(LedgerService).trialBalance();
    expect(tb.every((t) => t.balanced)).toBe(true);
  });

  it('previews with estimates, commission, reserve and a partner disclosure', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    const p = await c.post('/v1/orders/preview', MKT('AAPL', 'buy', '2')).expect(200);
    expect(p.body.canSubmit).toBe(true);
    expect(p.body.quote.simulated).toBe(true);
    expect(p.body.warnings.join(' ')).toMatch(/SANDBOX/);
    expect(new Decimal(p.body.reserveAmount.amount).gt(p.body.estimatedTotal.amount)).toBe(true);
    expect(p.body.disclosure).toMatch(/licensed brokerage partner/);
  });

  it('fills a market buy, records partner executions, charges commission and releases the unused reserve', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    const r = await c.idem('/v1/orders', MKT('MSFT', 'buy', '3')).expect(201);
    await drainAll(ctx);
    const d = await c.get(`/v1/orders/${r.body.id}`).expect(200);
    expect(d.body.order.status).toBe('filled');
    expect(d.body.executions).toHaveLength(1);
    const ex = d.body.executions[0];
    const cost = new Decimal(ex.gross.amount).add(ex.commission.amount);
    const b = await balances(c);
    expect(b.held).toBe('0.00');
    expect(new Decimal(b.available).toFixed(2)).toBe(new Decimal('5000').sub(cost).toFixed(2));
    const portfolio = await c.get('/v1/portfolio').expect(200);
    expect(portfolio.body.holdings.find((h: { symbol: string }) => h.symbol === 'MSFT').quantity).toBe('3');
    const fee = await ctx.db.one<{ status: string }>('SELECT f.status FROM fee_collections f JOIN executions e ON e.id = f.execution_id JOIN orders o ON o.id = e.order_id WHERE o.id = $1', [r.body.id]);
    expect(fee!.status).toBe('collected');
    const conf = await c.get(`/v1/orders/${r.body.id}/confirmation`).expect(200);
    expect(conf.body.notice).toMatch(/official confirmation is issued by the partner/);
  });

  it('handles partial fills across partner updates', async () => {
    const c = await onboardedCustomer(ctx, { fund: '20000.00' });
    const r = await c.idem('/v1/orders', MKT('KO', 'buy', '120')).expect(201);
    expect(r.body.status).toBe('partially_filled');
    expect(r.body.filledQuantity).toBe('60');
    await ctx.broker.tick();
    await drainAll(ctx);
    const d = await c.get(`/v1/orders/${r.body.id}`).expect(200);
    expect(d.body.order.status).toBe('filled');
    expect(d.body.order.filledQuantity).toBe('120');
    expect(d.body.executions).toHaveLength(2);
    // Commission minimum/max applied on cumulative notional, not per fill.
    const totalFee = d.body.executions.reduce((s: Decimal, e: { commission: { amount: string } }) => s.add(e.commission.amount), new Decimal(0));
    expect(totalFee.lte(10)).toBe(true);
    expect((await balances(c)).held).toBe('0.00');
  });

  it('cancels a partially filled order and releases only the unfilled reserve', async () => {
    const c = await onboardedCustomer(ctx, { fund: '20000.00' });
    const r = await c.idem('/v1/orders', MKT('KO', 'buy', '200')).expect(201);
    expect(r.body.status).toBe('partially_filled');
    const x = await c.post(`/v1/orders/${r.body.id}/cancel`).expect(200);
    expect(x.body.status).toBe('canceled');
    expect(x.body.filledQuantity).toBe('100');
    const d = await c.get(`/v1/orders/${r.body.id}`).expect(200);
    const spent = d.body.executions.reduce((s: Decimal, e: { gross: { amount: string }; commission: { amount: string } }) => s.add(e.gross.amount).add(e.commission.amount), new Decimal(0));
    const b = await balances(c);
    expect(b.held).toBe('0.00');
    expect(new Decimal(b.available).toFixed(2)).toBe(new Decimal(20000).sub(spent).toFixed(2));
    await c.post(`/v1/orders/${r.body.id}/cancel`).expect(409);
  });

  it('rests a limit order below market and cancels it with a full release', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    const q = await c.get('/v1/quotes/JPM').expect(200);
    const limit = new Decimal(q.body.last).mul(0.7).toFixed(2);
    const r = await c.idem('/v1/orders', { symbol: 'JPM', side: 'buy', type: 'limit', timeInForce: 'gtc', quantity: '5', limitPrice: limit }).expect(201);
    expect(r.body.status).toBe('accepted');
    expect(new Decimal((await balances(c)).held).gt(0)).toBe(true);
    await c.post(`/v1/orders/${r.body.id}/cancel`).expect(200);
    const b = await balances(c);
    expect(b.held).toBe('0.00');
    expect(b.available).toBe('5000.00');
  });

  it('records partner rejections and releases the reserve', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    await ctx.broker.setFault('reject_symbol:XOM', 'true');
    const r = await c.idem('/v1/orders', MKT('XOM', 'buy', '1')).expect(201);
    await ctx.broker.setFault('reject_symbol:XOM', null);
    expect(r.body.status).toBe('rejected');
    expect(r.body.rejectReason).toMatch(/not tradable/);
    expect((await balances(c)).available).toBe('5000.00');
  });

  it('never creates a second order for a repeated Idempotency-Key', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    const key = randomUUID();
    const a = await c.idem('/v1/orders', MKT('V', 'buy', '1'), key).expect(201);
    const b = await c.idem('/v1/orders', MKT('V', 'buy', '1'), key).expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers['idempotent-replayed']).toBe('true');
    await c.idem('/v1/orders', MKT('V', 'buy', '2'), key).expect(422);
    const n = await ctx.db.one<{ n: string }>('SELECT count(*)::text AS n FROM orders WHERE user_id = $1', [c.userId]);
    expect(n!.n).toBe('1');
    await c.post('/v1/orders', MKT('V', 'buy', '1')).expect(400); // missing key
  });

  it('blocks market orders on stale market data but allows limit orders with a warning', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    await ctx.redis.client.set('sandbox:md:stale:JNJ', '600');
    await ctx.redis.client.del('md:q:JNJ');
    const p = await c.post('/v1/orders/preview', MKT('JNJ', 'buy', '1')).expect(200);
    expect(p.body.canSubmit).toBe(false);
    expect(p.body.blockers.join(' ')).toMatch(/stale/);
    await c.idem('/v1/orders', MKT('JNJ', 'buy', '1')).expect(422);
    const lim = await c.post('/v1/orders/preview', { symbol: 'JNJ', side: 'buy', type: 'limit', timeInForce: 'day', quantity: '1', limitPrice: p.body.quote.last }).expect(200);
    expect(lim.body.warnings.join(' ')).toMatch(/old/);
    await ctx.redis.client.del('sandbox:md:stale:JNJ', 'md:q:JNJ');
  });

  it('rejects orders exceeding available cash, sells beyond holdings and fat-finger prices', async () => {
    const c = await onboardedCustomer(ctx, { fund: '100.00' });
    const big = await c.post('/v1/orders/preview', MKT('NVDA', 'buy', '50')).expect(200);
    expect(big.body.blockers.join(' ')).toMatch(/Insufficient available cash/);
    const sell = await c.post('/v1/orders/preview', MKT('NVDA', 'sell', '1')).expect(200);
    expect(sell.body.blockers.join(' ')).toMatch(/sell at most 0/);
    const q = await c.get('/v1/quotes/NVDA').expect(200);
    const fat = await c.post('/v1/orders/preview', { symbol: 'NVDA', side: 'buy', type: 'limit', timeInForce: 'day', quantity: '1', limitPrice: new Decimal(q.body.last).mul(3).toFixed(2) }).expect(200);
    expect(fat.body.blockers.join(' ')).toMatch(/away from the last price/);
    const frac = await c.post('/v1/orders/preview', MKT('GLD', 'buy', '0.5')).expect(200);
    expect(frac.body.blockers.join(' ')).toMatch(/fractional/);
  });

  it.each([1, 2, 3])('serialises concurrent orders so cash is never double-spent (run %i)', async () => {
    const c = await onboardedCustomer(ctx, { fund: '1000.00' });
    const q = await c.get('/v1/quotes/AAPL').expect(200);
    const qty = new Decimal(300).div(q.body.last).floor().toString(); // ~$300 + 5% collar each
    const results = await Promise.all(Array.from({ length: 6 }, () => c.idem('/v1/orders', MKT('AAPL', 'buy', qty))));
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 422);
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(ok).toBeLessThanOrEqual(3);
    expect(ok + rejected.length).toBe(6);
    await drainAll(ctx);
    const b = await balances(c);
    expect(new Decimal(b.available).gte(0)).toBe(true);
    expect(b.held).toBe('0.00');
  });

  it('survives a partner outage: order stays pending, then resolves without duplication', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    await ctx.broker.setFault('outage', 'true');
    const r = await c.idem('/v1/orders', MKT('QQQ', 'buy', '1')).expect(201);
    expect(r.body.status).toBe('pending_submit');
    expect(new Decimal((await balances(c)).held).gt(0)).toBe(true);
    await ctx.broker.setFault('outage', null);
    await drainAll(ctx);
    const d = await c.get(`/v1/orders/${r.body.id}`).expect(200);
    expect(d.body.order.status).toBe('filled');
    const partnerOrders = await ctx.db.one<{ n: string }>('SELECT count(*)::text AS n FROM sandbox_partner.orders WHERE client_order_id = $1', [r.body.clientOrderId]);
    expect(partnerOrders!.n).toBe('1');
  });

  it('resolves an ambiguous timeout (partner accepted, response lost) by client order id', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    await ctx.broker.setFault('timeout_next_submit', 'true');
    const r = await c.idem('/v1/orders', MKT('VTI', 'buy', '2')).expect(201);
    expect(r.body.status).toBe('pending_submit');
    await drainAll(ctx);
    const d = await c.get(`/v1/orders/${r.body.id}`).expect(200);
    expect(d.body.order.status).toBe('filled');
    const n = await ctx.db.one<{ n: string }>('SELECT count(*)::text AS n FROM sandbox_partner.orders WHERE client_order_id = $1', [r.body.clientOrderId]);
    expect(n!.n).toBe('1');
    expect(d.body.events.map((e: { event_type: string }) => e.event_type)).toContain('submission_uncertain');
  });

  it('sells, holds proceeds as unsettled until settlement date, then makes them available', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    await c.idem('/v1/orders', MKT('SPY', 'buy', '2')).expect(201);
    await drainAll(ctx);
    const afterBuy = await balances(c);
    const s = await c.idem('/v1/orders', MKT('SPY', 'sell', '2')).expect(201);
    await drainAll(ctx);
    expect(s.body.status).toBe('filled');
    const b = await balances(c);
    expect(new Decimal(b.unsettled).gt(0)).toBe(true);
    expect(b.available).toBe(afterBuy.available);
    const orders = ctx.app.get(OrdersService);
    await orders.settleExecutions(new Date().toISOString().slice(0, 10)); // not yet due (T+1)
    expect((await balances(c)).unsettled).toBe(b.unsettled);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await orders.settleExecutions(future);
    const settled = await balances(c);
    expect(settled.unsettled).toBe('0.00');
    expect(new Decimal(settled.available).toFixed(2)).toBe(new Decimal(afterBuy.available).add(b.unsettled).toFixed(2));
  });

  it('mirrors partner dividends into the ledger exactly once', async () => {
    const c = await onboardedCustomer(ctx, { fund: '5000.00' });
    await c.idem('/v1/orders', MKT('SCHD', 'buy', '10')).expect(201);
    await drainAll(ctx);
    const before = await balances(c);
    const acct = await ctx.db.one<{ id: string; provider_account_id: string }>('SELECT id, provider_account_id FROM brokerage_accounts WHERE user_id = $1', [c.userId]);
    await ctx.broker.simulateDividend(acct!.provider_account_id, 'SCHD', '0.25');
    const brokerage = ctx.app.get((await import('../src/brokerage/brokerage.service')).BrokerageService);
    await brokerage.syncAccount(acct!.id);
    await brokerage.syncAccount(acct!.id);
    const after = await balances(c);
    expect(new Decimal(after.available).sub(before.available).toFixed(2)).toBe('2.50');
    const divs = await c.get('/v1/dividends').expect(200);
    expect(divs.body).toHaveLength(1);
  });

  it('reconciles cleanly against the partner and detects a cash break', async () => {
    const c = await onboardedCustomer(ctx, { fund: '3000.00' });
    await c.idem('/v1/orders', MKT('IWM', 'buy', '1')).expect(201);
    await drainAll(ctx);
    const recon = ctx.app.get(ReconciliationService);
    const clean = await recon.run();
    const mine = await ctx.db.query("SELECT * FROM reconciliation_breaks WHERE run_id = $1 AND user_id = $2", [clean.runId, c.userId]);
    expect(mine).toHaveLength(0);
    expect(clean.trialBalanceOk).toBe(true);
    const acct = await ctx.db.one<{ provider_account_id: string }>('SELECT provider_account_id FROM brokerage_accounts WHERE user_id = $1', [c.userId]);
    await ctx.db.query('UPDATE sandbox_partner.accounts SET cash = cash + 12.34 WHERE id = $1', [acct!.provider_account_id]);
    const dirty = await recon.run();
    const breaks = await ctx.db.query<{ kind: string; difference: string }>("SELECT kind, difference FROM reconciliation_breaks WHERE run_id = $1 AND user_id = $2", [dirty.runId, c.userId]);
    expect(breaks).toEqual([{ kind: 'cash', difference: '12.34' }]);
  });

  it('isolates customers: no access to another customer\'s orders; no anonymous access', async () => {
    const a = await onboardedCustomer(ctx, { fund: '1000.00' });
    const b = await registerAndLogin(ctx);
    const r = await a.idem('/v1/orders', MKT('KO', 'buy', '1')).expect(201);
    await b.get(`/v1/orders/${r.body.id}`).expect(404);
    await b.post(`/v1/orders/${r.body.id}/cancel`).expect(404);
    const anon = await import('supertest');
    await anon.default(ctx.app.getHttpServer()).get('/v1/portfolio').expect(401);
    await a.get('/v1/admin/overview').expect(401);
  });
});
