import { Decimal } from '../common/money';
import { commissionFor } from './fee.service';

const s = { commission_bps: 10, commission_min_minor: 100n, commission_max_minor: 1000n, currency: 'USD' };

describe('commission', () => {
  it('applies bps with min and max', () => {
    expect(commissionFor(new Decimal(50), s)).toBe(100n); // 0.05 -> min 1.00
    expect(commissionFor(new Decimal(5000), s)).toBe(500n); // 5.00
    expect(commissionFor(new Decimal(1_000_000), s)).toBe(1000n); // capped at 10.00
    expect(commissionFor(new Decimal(0), s)).toBe(0n);
  });
});
