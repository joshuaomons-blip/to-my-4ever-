import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../database/db.service';
import { Decimal, roundToMinor } from '../common/money';

export interface FeeSchedule {
  id: string;
  version: number;
  currency: string;
  commission_bps: number;
  commission_min_minor: bigint;
  commission_max_minor: bigint | null;
  fx_spread_bps: number;
  deposit_fee_minor: bigint;
  withdrawal_fee_minor: bigint;
}

/** Commission on a cumulative notional, clamped to [min, max]. Pure for unit testing. */
export function commissionFor(notional: Decimal, s: Pick<FeeSchedule, 'commission_bps' | 'commission_min_minor' | 'commission_max_minor' | 'currency'>): bigint {
  if (notional.lte(0)) return 0n;
  let fee = roundToMinor(notional.mul(s.commission_bps).div(10_000), s.currency, Decimal.ROUND_HALF_UP);
  if (fee < BigInt(s.commission_min_minor)) fee = BigInt(s.commission_min_minor);
  if (s.commission_max_minor !== null && fee > BigInt(s.commission_max_minor)) fee = BigInt(s.commission_max_minor);
  return fee;
}

@Injectable()
export class FeeService {
  constructor(private readonly db: DbService) {}

  async active(currency: string, q: Queryable = this.db.pool): Promise<FeeSchedule> {
    const r = await q.query<FeeSchedule>("SELECT * FROM fee_schedules WHERE status = 'active' AND currency = $1", [currency]);
    if (!r.rows[0]) throw new Error(`No active fee schedule for ${currency}`);
    const s = r.rows[0];
    return {
      ...s,
      commission_min_minor: BigInt(s.commission_min_minor),
      commission_max_minor: s.commission_max_minor === null ? null : BigInt(s.commission_max_minor),
      deposit_fee_minor: BigInt(s.deposit_fee_minor),
      withdrawal_fee_minor: BigInt(s.withdrawal_fee_minor),
    };
  }
}
