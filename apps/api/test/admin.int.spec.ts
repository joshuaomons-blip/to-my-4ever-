import { anon, staffClient, staffStepUp } from './admin-helpers';
import { MKT, TestCtx, onboardedCustomer, setupApp } from './helpers';

describe('admin console API: RBAC, step-up, maker-checker', () => {
  let ctx: TestCtx;
  beforeAll(async () => (ctx = await setupApp()));
  afterAll(async () => ctx.close());

  it('denies unauthenticated and customer-cookie access to admin APIs', async () => {
    await anon(ctx).get('/v1/admin/overview').expect(401);
    const c = await onboardedCustomer(ctx);
    await c.get('/v1/admin/customers').expect(401);
  });

  it('enforces least privilege per role and audits denials', async () => {
    const support = await staffClient(ctx, ['support_agent']);
    await support.get('/v1/admin/support/tickets').expect(200);
    const r = await support.get('/v1/admin/withdrawals').expect(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    await support.get('/v1/admin/audit').expect(403);
    const denied = await ctx.db.one("SELECT 1 FROM audit_log WHERE action = 'admin.access_denied' AND actor_id = $1", [support.userId]);
    expect(denied).toBeTruthy();
    const auditor = await staffClient(ctx, ['auditor']);
    await auditor.get('/v1/admin/audit').expect(200);
    await auditor.put('/v1/admin/controls/trading_enabled', { enabled: false, reason: 'auditor attempt' }).expect(403);
  });

  it('masks PII for roles without customers.pii', async () => {
    const c = await onboardedCustomer(ctx);
    const support = await staffClient(ctx, ['support_agent']);
    const s = await support.get(`/v1/admin/customers/${c.userId}`).expect(200);
    expect(s.body.user.email).not.toBe(c.email);
    expect(s.body.profile.address_line1).toBeUndefined();
    const compliance = await staffClient(ctx, ['compliance_officer']);
    const full = await compliance.get(`/v1/admin/customers/${c.userId}`).expect(200);
    expect(full.body.user.email).toBe(c.email);
    expect(full.body.profile.tax_id_enc).toBeUndefined();
  });

  it('requires step-up for sensitive actions and four-eyes to lift a restriction', async () => {
    const c = await onboardedCustomer(ctx, { fund: '1000.00' });
    const a = await staffClient(ctx, ['compliance_officer']);
    await ctx.db.query("UPDATE sessions SET step_up_at = now() - interval '1 hour' WHERE subject_id = $1", [a.userId]);
    const noStep = await a.post(`/v1/admin/customers/${c.userId}/restrictions`, { type: 'trading_block', reason: 'Investigating unusual activity' }).expect(403);
    expect(noStep.body.error.code).toBe('STEP_UP_REQUIRED');
    await staffStepUp(a);
    const r = await a.post(`/v1/admin/customers/${c.userId}/restrictions`, { type: 'trading_block', reason: 'Investigating unusual activity' }).expect(201);
    const blocked = await c.post('/v1/orders/preview', MKT('AAPL', 'buy', '1')).expect(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_RESTRICTED');
    const self = await a.post(`/v1/admin/restrictions/${r.body.id}/lift`, { reason: 'Resolved after review' }).expect(403);
    expect(self.body.error.code).toBe('FOUR_EYES_REQUIRED');
    const b = await staffClient(ctx, ['compliance_officer']);
    await b.post(`/v1/admin/restrictions/${r.body.id}/lift`, { reason: 'Resolved after review' }).expect(200);
    await c.post('/v1/orders/preview', MKT('AAPL', 'buy', '1')).expect(200);
    const restriction = await ctx.db.one<{ lifted_at: Date }>('SELECT lifted_at FROM account_restrictions WHERE id = $1', [r.body.id]);
    expect(restriction!.lifted_at).toBeTruthy(); // lifted, never deleted
  });

  it('decides manual reviews only after screening matches are resolved', async () => {
    const c = await onboardedCustomer(ctx, { profile: { legalFirstName: 'Sanction', legalLastName: 'Testperson' } });
    const officer = await staffClient(ctx, ['compliance_officer']);
    const queue = await officer.get('/v1/admin/onboarding/reviews').expect(200);
    const app = queue.body.find((x: { user_id: string }) => x.user_id === c.userId);
    expect(app.open_screening_matches).toBe(1);
    const early = await officer.post(`/v1/admin/onboarding/${app.id}/decision`, { decision: 'approve', reason: 'Looks fine' }).expect(409);
    expect(early.body.error.code).toBe('SCREENING_UNRESOLVED');
    const sr = await ctx.db.one<{ id: string }>('SELECT id FROM screening_results WHERE user_id = $1', [c.userId]);
    await officer.post(`/v1/admin/screening/${sr!.id}/review`, { outcome: 'false_positive', note: 'DOB and nationality differ from list entry' }).expect(200);
    await officer.post(`/v1/admin/onboarding/${app.id}/decision`, { decision: 'approve', reason: 'Cleared after EDD' }).expect(200);
    await ctx.jobs.drain();
    const s = await c.get('/v1/onboarding').expect(200);
    expect(s.body.status).toBe('approved');
    expect(s.body.brokerageAccount.status).toBe('active');
  });

  it('activates fee schedules only with a second approver', async () => {
    const maker = await staffClient(ctx, ['finance']);
    const draft = await maker.post('/v1/admin/fees', { currency: 'USD', commissionBps: 15, commissionMinMinor: 0, commissionMaxMinor: 1500, fxSpreadBps: 30, depositFeeMinor: 0, withdrawalFeeMinor: 0, notes: 'Proposed 2027 schedule' }).expect(201);
    const self = await maker.post(`/v1/admin/fees/${draft.body.id}/activate`).expect(403);
    expect(self.body.error.code).toBe('FOUR_EYES_REQUIRED');
    const checker = await staffClient(ctx, ['finance']);
    await checker.post(`/v1/admin/fees/${draft.body.id}/activate`).expect(200);
    const pub = await anon(ctx).get('/v1/public/fees').expect(200);
    expect(pub.body.commission.rateBps).toBe(15);
    // restore
    const restore = await maker.post('/v1/admin/fees', { currency: 'USD', commissionBps: 10, commissionMinMinor: 0, commissionMaxMinor: 1000, fxSpreadBps: 25, depositFeeMinor: 0, withdrawalFeeMinor: 0, notes: 'Restore sandbox schedule' }).expect(201);
    await checker.post(`/v1/admin/fees/${restore.body.id}/activate`).expect(200);
  });

  it('kill switch pauses trading platform-wide', async () => {
    const c = await onboardedCustomer(ctx, { fund: '500.00' });
    const ops = await staffClient(ctx, ['operations']);
    await ops.put('/v1/admin/controls/trading_enabled', { enabled: false, reason: 'Partner incident drill' }).expect(200);
    const r = await c.post('/v1/orders/preview', MKT('AAPL', 'buy', '1')).expect(503);
    expect(r.body.error.code).toBe('PLATFORM_PAUSED');
    await ops.put('/v1/admin/controls/trading_enabled', { enabled: true, reason: 'Drill complete' }).expect(200);
    await c.post('/v1/orders/preview', MKT('AAPL', 'buy', '1')).expect(200);
  });

  it('refuses to enable sanctioned jurisdictions and invalid jurisdiction configs', async () => {
    const officer = await staffClient(ctx, ['compliance_officer']);
    const body = { status: 'sandbox_only', onboardingEnabled: true, tradingEnabled: true, depositsEnabled: true, withdrawalsEnabled: true, reason: 'Attempting to enable' };
    const r = await officer.put('/v1/admin/jurisdictions/IR', body).expect(403);
    expect(r.body.error.code).toBe('SANCTIONED_JURISDICTION');
    const live = await officer.put('/v1/admin/jurisdictions/CA', { ...body, status: 'live' }).expect(422);
    expect(live.body.error.code).toBe('INVALID_JURISDICTION_CONFIG');
    const wait = await officer.put('/v1/admin/jurisdictions/CA', { ...body, status: 'waitlist' }).expect(422);
    expect(wait.body.error.code).toBe('INVALID_JURISDICTION_CONFIG');
  });

  it('requires two distinct approvers per launch gate', async () => {
    const a = await staffClient(ctx, ['operations']);
    const b = await staffClient(ctx, ['compliance_officer']);
    const first = await a.post('/v1/admin/launch-gates/dr_tested/approve', { evidenceRef: 'DR-2026-10-exercise' }).expect(200);
    expect(first.body.pending).toContain('dr_tested');
    await a.post('/v1/admin/launch-gates/dr_tested/approve', { evidenceRef: 'again' }).expect(409);
    const second = await b.post('/v1/admin/launch-gates/dr_tested/approve', { evidenceRef: 'DR-2026-10-signoff' }).expect(200);
    expect(second.body.pending).not.toContain('dr_tested');
    expect(second.body.pending.length).toBeGreaterThan(0);
  });

  it('verifies the audit hash chain is intact', async () => {
    const auditor = await staffClient(ctx, ['auditor']);
    const v = await auditor.get('/v1/admin/audit/verify').expect(200);
    expect(v.body.entries).toBeGreaterThan(10);
    expect(v.body.intact).toBe(true);
  });
});
