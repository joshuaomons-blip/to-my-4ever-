import { ControlsService } from './controls.service';
import { DbService } from '../database/db.service';
import { EligibilityService, JurisdictionRow, ageOn, jurisdictionAllows } from './eligibility.service';

const J = (over: Partial<JurisdictionRow>): JurisdictionRow => ({
  code: 'GB', name: 'United Kingdom', region: 'europe', status: 'sandbox_only', onboarding_enabled: true, trading_enabled: true,
  deposits_enabled: true, withdrawals_enabled: true, broker_provider: 'sandbox', payment_providers: [], allowed_currencies: ['USD'],
  min_age: 18, requires_tax_id: true, ...over,
});

describe('eligibility', () => {
  const svc = new EligibilityService({} as DbService, {} as ControlsService);
  it('computes age correctly around birthdays', () => {
    expect(ageOn(new Date('2000-06-15'), new Date('2018-06-14'))).toBe(17);
    expect(ageOn(new Date('2000-06-15'), new Date('2018-06-15'))).toBe(18);
  });
  it('never permits sandbox-only countries in live mode', () => {
    expect(jurisdictionAllows(J({}), 'trading', 'sandbox')).toBe(true);
    expect(jurisdictionAllows(J({}), 'trading', 'live')).toBe(false);
    expect(jurisdictionAllows(J({ status: 'live' }), 'trading', 'live')).toBe(true);
    expect(jurisdictionAllows(J({ status: 'blocked' }), 'onboarding', 'sandbox')).toBe(false);
  });
  it('flags sanctioned nationality and PEPs for manual review', () => {
    const r = svc.evaluate({ residence: J({}), nationality: J({ code: 'IR', region: 'sanctioned' }), dateOfBirth: new Date('1990-01-01'), taxIdProvided: true, isPep: true, mode: 'sandbox' });
    expect(r.eligible).toBe(true);
    expect(r.requiresManualReview).toBe(true);
    expect(r.manualReviewReasons).toHaveLength(2);
  });
  it('requires tax id where configured', () => {
    const r = svc.evaluate({ residence: J({}), dateOfBirth: new Date('1990-01-01'), taxIdProvided: false, mode: 'sandbox' });
    expect(r.eligible).toBe(false);
  });
});
