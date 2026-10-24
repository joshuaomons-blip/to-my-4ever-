import { PROFILE, TestCtx, acceptAllDocs, enableMfa, onboardedCustomer, registerAndLogin, setupApp } from './helpers';

describe('onboarding, eligibility and KYC', () => {
  let ctx: TestCtx;
  beforeAll(async () => (ctx = await setupApp()));
  afterAll(async () => ctx.close());

  it('approves a clear applicant automatically and opens a partner account', async () => {
    const c = await onboardedCustomer(ctx);
    const s = await c.get('/v1/onboarding').expect(200);
    expect(s.body.status).toBe('approved');
    expect(s.body.brokerageAccount.status).toBe('active');
    expect(s.body.profile.taxIdLast4).toBe('456C');
    expect(JSON.stringify(s.body)).not.toContain('QQ123456C');
    const raw = await ctx.db.one<{ tax_id_enc: string }>('SELECT tax_id_enc FROM customer_profiles WHERE user_id = $1', [c.userId]);
    expect(raw!.tax_id_enc.startsWith('v1.')).toBe(true);
  });

  it('requires MFA, a complete profile and accepted disclosures before submission', async () => {
    const c = await registerAndLogin(ctx);
    let r = await c.post('/v1/onboarding/submit').expect(422);
    expect(r.body.error.code).toBe('MFA_REQUIRED_FOR_ONBOARDING');
    await enableMfa(c);
    r = await c.post('/v1/onboarding/submit').expect(422);
    expect(r.body.error.code).toBe('PROFILE_INCOMPLETE');
    await c.put('/v1/onboarding/profile', PROFILE).expect(200);
    r = await c.post('/v1/onboarding/submit').expect(422);
    expect(r.body.error.code).toBe('DISCLOSURES_REQUIRED');
  });

  it('marks residents of unsupported or sanctioned countries ineligible and never opens an account', async () => {
    for (const country of ['CA', 'IR']) {
      const c = await registerAndLogin(ctx, { country });
      await enableMfa(c);
      const p = await c.put('/v1/onboarding/profile', { ...PROFILE, residenceCountry: country, nationality: country }).expect(200);
      expect(p.body.eligibility.eligible).toBe(false);
      await acceptAllDocs(c);
      const s = await c.post('/v1/onboarding/submit').expect(200);
      expect(s.body.status).toBe('ineligible');
      await ctx.jobs.drain();
      expect(await ctx.db.one('SELECT 1 FROM brokerage_accounts WHERE user_id = $1', [c.userId])).toBeUndefined();
    }
  });

  it('rejects under-age applicants', async () => {
    const c = await registerAndLogin(ctx);
    await enableMfa(c);
    const p = await c.put('/v1/onboarding/profile', { ...PROFILE, dateOfBirth: `${new Date().getUTCFullYear() - 16}-01-01` }).expect(200);
    expect(p.body.eligibility.eligible).toBe(false);
    expect(p.body.eligibility.reasons.join(' ')).toMatch(/at least 18/);
  });

  it('routes KYC "consider" results and screening matches to manual review', async () => {
    const review = await onboardedCustomer(ctx, { profile: { legalLastName: 'Reviewson' } });
    expect((await review.get('/v1/onboarding').expect(200)).body.status).toBe('manual_review');
    const hit = await onboardedCustomer(ctx, { profile: { legalFirstName: 'Sanction', legalLastName: 'Testperson' } });
    expect((await hit.get('/v1/onboarding').expect(200)).body.status).toBe('manual_review');
    const screening = await ctx.db.one<{ status: string }>('SELECT status FROM screening_results WHERE user_id = $1', [hit.userId]);
    expect(screening!.status).toBe('potential_match');
  });

  it('rejects failed identity verification', async () => {
    const c = await onboardedCustomer(ctx, { profile: { legalLastName: 'Rejectman' } });
    const s = await c.get('/v1/onboarding').expect(200);
    expect(s.body.status).toBe('rejected');
    expect(await ctx.db.one('SELECT 1 FROM brokerage_accounts WHERE user_id = $1', [c.userId])).toBeUndefined();
  });

  it('locks the profile after submission and blocks trading before approval', async () => {
    const c = await onboardedCustomer(ctx, { profile: { legalLastName: 'Reviewlock' } });
    await c.put('/v1/onboarding/profile', PROFILE).expect(409);
    const r = await c.post('/v1/orders/preview', { symbol: 'AAPL', side: 'buy', type: 'market', timeInForce: 'day', quantity: '1' }).expect(403);
    expect(r.body.error.code).toBe('ONBOARDING_INCOMPLETE');
  });
});
