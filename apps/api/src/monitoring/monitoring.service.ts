import { Injectable } from '@nestjs/common';
import { Queryable } from '../database/db.service';

/** Thresholds are illustrative and must be calibrated by the MLRO/BSA officer as part of the AML programme. */
export const MONITORING_RULES = {
  largeDepositMinor: 1_000_000n, // 10,000.00
  structuringBandMinor: 900_000n, // deposits between 9,000 and 10,000
  structuringCount: 3,
  velocityDepositsPerDay: 5,
  rapidOutHours: 48,
};

/** Rules-based transaction monitoring. Alerts go to the compliance queue; no automatic filings are made. */
@Injectable()
export class MonitoringService {
  private async alert(q: Queryable, userId: string, rule: string, severity: string, details: Record<string, unknown>, dedupeKey: string) {
    await q.query(
      `INSERT INTO monitoring_alerts (user_id, rule, severity, details, dedupe_key) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING`,
      [userId, rule, severity, JSON.stringify(details), dedupeKey],
    );
  }

  async onDepositSettled(q: Queryable, userId: string, depositId: string, amountMinor: bigint): Promise<void> {
    const R = MONITORING_RULES;
    if (amountMinor >= R.largeDepositMinor) {
      await this.alert(q, userId, 'large_deposit', 'medium', { depositId, amountMinor: amountMinor.toString() }, `large:${depositId}`);
    }
    const s = (
      await q.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM deposits WHERE user_id = $1 AND status = 'settled'
           AND amount_minor >= $2 AND amount_minor < $3 AND created_at > now() - interval '7 days'`,
        [userId, R.structuringBandMinor.toString(), R.largeDepositMinor.toString()],
      )
    ).rows[0]!;
    if (Number(s.n) >= R.structuringCount) {
      await this.alert(q, userId, 'possible_structuring', 'high', { count: Number(s.n) }, `struct:${userId}:${new Date().toISOString().slice(0, 10)}`);
    }
    const v = (await q.query<{ n: string }>("SELECT count(*)::text AS n FROM deposits WHERE user_id = $1 AND created_at > now() - interval '1 day'", [userId])).rows[0]!;
    if (Number(v.n) > R.velocityDepositsPerDay) {
      await this.alert(q, userId, 'deposit_velocity', 'medium', { count24h: Number(v.n) }, `velocity:${userId}:${new Date().toISOString().slice(0, 10)}`);
    }
  }

  async onWithdrawalRequested(q: Queryable, userId: string, withdrawalId: string): Promise<boolean> {
    const r = (
      await q.query<{ deposits: string; trades: string }>(
        `SELECT (SELECT count(*) FROM deposits WHERE user_id = $1 AND status = 'settled' AND settled_at > now() - make_interval(hours => $2))::text AS deposits,
                (SELECT count(*) FROM orders WHERE user_id = $1 AND filled_quantity > 0 AND created_at > now() - make_interval(hours => $2))::text AS trades`,
        [userId, MONITORING_RULES.rapidOutHours],
      )
    ).rows[0]!;
    if (Number(r.deposits) > 0 && Number(r.trades) === 0) {
      await this.alert(q, userId, 'rapid_in_out', 'high', { withdrawalId, recentDeposits: Number(r.deposits) }, `rapid:${withdrawalId}`);
      return true;
    }
    return false;
  }
}
