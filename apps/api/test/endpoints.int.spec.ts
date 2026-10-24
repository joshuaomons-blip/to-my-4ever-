import { staffClient } from './admin-helpers';
import { MKT, TestCtx, drainAll, onboardedCustomer, setupApp } from './helpers';

/** Every read endpoint must answer 200 for an active customer and a super-admin (catches SQL/runtime errors). */
describe('read endpoint smoke test', () => {
  let ctx: TestCtx;
  beforeAll(async () => (ctx = await setupApp()));
  afterAll(async () => ctx.close());

  it('customer endpoints', async () => {
    const c = await onboardedCustomer(ctx, { fund: '1000.00' });
    const o = await c.idem('/v1/orders', MKT('AAPL', 'buy', '1')).expect(201);
    await drainAll(ctx);
    const t = await c.post('/v1/support/tickets', { subject: 'Question', category: 'other', message: 'Hello' }).expect(201);
    const paths = [
      '/v1/auth/session', '/v1/auth/sessions', '/v1/onboarding', '/v1/portfolio', '/v1/portfolio/history?days=30', '/v1/instruments?q=a',
      '/v1/instruments/AAPL', '/v1/quotes/AAPL', '/v1/quotes?symbols=AAPL,MSFT', '/v1/bars/AAPL?range=1D', '/v1/bars/AAPL?range=5Y', '/v1/watchlists',
      '/v1/orders', '/v1/orders?status=open', `/v1/orders/${o.body.id}`, `/v1/orders/${o.body.id}/confirmation`, '/v1/funding', '/v1/activity',
      '/v1/documents', '/v1/dividends', '/v1/notifications', '/v1/support/tickets', `/v1/support/tickets/${t.body.id}`,
      '/v1/public/platform', '/v1/public/jurisdictions', '/v1/public/documents', '/v1/public/fees',
    ];
    for (const p of paths) {
      const r = await c.get(p);
      expect({ p, status: r.status }).toEqual({ p, status: 200 });
    }
    const activity = await c.get('/v1/activity').expect(200);
    const kinds = activity.body.map((a: { type: string }) => a.type);
    expect(kinds).toEqual(expect.arrayContaining(['deposit_settled', 'trade_buy', 'order_hold']));
    const buy = activity.body.find((a: { type: string }) => a.type === 'trade_buy');
    expect(Number(buy.changes.held)).toBeLessThan(0);
  });

  it('admin endpoints', async () => {
    const c = await onboardedCustomer(ctx, { fund: '100.00' });
    const admin = await staffClient(ctx, ['super_admin']);
    const paths = [
      '/v1/admin/auth/me', '/v1/admin/overview', '/v1/admin/customers', `/v1/admin/customers/${c.userId}`, '/v1/admin/onboarding/reviews',
      '/v1/admin/withdrawals', '/v1/admin/alerts', '/v1/admin/alerts?status=all', '/v1/admin/payments/deposits', '/v1/admin/reconciliation',
      '/v1/admin/support/tickets', '/v1/admin/fees', '/v1/admin/controls', '/v1/admin/jurisdictions', '/v1/admin/launch-gates', '/v1/admin/audit',
      '/v1/admin/audit/verify', '/v1/admin/system', '/v1/admin/reports/compliance', '/v1/admin/staff',
    ];
    for (const p of paths) {
      const r = await admin.get(p);
      expect({ p, status: r.status }).toEqual({ p, status: 200 });
    }
  });
});
