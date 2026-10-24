import { settlementDate } from './settlement';

describe('settlement date', () => {
  it('is T+1 business day, skipping weekends', () => {
    expect(settlementDate(new Date('2026-10-22T15:00:00Z'))).toBe('2026-10-23'); // Thu -> Fri
    expect(settlementDate(new Date('2026-10-23T15:00:00Z'))).toBe('2026-10-26'); // Fri -> Mon
  });
});
