import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../database/db.service';
import { Decimal, fromMinor, roundToMinor } from '../common/money';
import { BrokerageService } from '../brokerage/brokerage.service';
import { LedgerService } from '../ledger/ledger.service';

export interface ReconSummary {
  runId: string;
  accountsChecked: number;
  breaks: number;
  trialBalanceOk: boolean;
}

/**
 * Daily reconciliation of platform records against the partner's authoritative records.
 * Breaks are recorded for operations to investigate; nothing is auto-corrected.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger('Reconciliation');

  constructor(private readonly db: DbService, private readonly brokerage: BrokerageService, private readonly ledger: LedgerService) {}

  async run(): Promise<ReconSummary> {
    const run = (await this.db.one<{ id: string }>("INSERT INTO reconciliation_runs (kind, status) VALUES ('cash','running') RETURNING id"))!;
    let breaks = 0;
    let checked = 0;
    const addBreak = async (b: { kind: string; userId?: string; accountId?: string; reference?: string; expected: string; actual: string; difference?: string; details?: unknown }) => {
      breaks++;
      await this.db.query(
        `INSERT INTO reconciliation_breaks (run_id, kind, user_id, brokerage_account_id, reference, expected, actual, difference, details)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [run.id, b.kind, b.userId ?? null, b.accountId ?? null, b.reference ?? null, b.expected, b.actual, b.difference ?? null, JSON.stringify(b.details ?? {})],
      );
    };
    try {
      const tb = await this.ledger.trialBalance();
      const tbOk = tb.every((t) => t.balanced);
      if (!tbOk) await addBreak({ kind: 'trial_balance', expected: '0', actual: JSON.stringify(tb) });

      const accounts = await this.db.query<{ id: string; user_id: string; provider_account_id: string; currency: string }>(
        "SELECT id, user_id, provider_account_id, currency FROM brokerage_accounts WHERE status IN ('active','restricted') AND provider = $1 AND provider_account_id IS NOT NULL",
        [this.brokerage.adapter.name],
      );
      for (const a of accounts) {
        checked++;
        try {
          const [bal, positions] = await Promise.all([this.brokerage.adapter.getBalances(a.provider_account_id), this.brokerage.adapter.getPositions(a.provider_account_id)]);
          // Cash: partner cash should equal ledger customer total + platform fees not yet collected.
          const led = await this.ledger.customerBalances(a.user_id, a.currency);
          const uncollected = BigInt((await this.db.one<{ s: string }>("SELECT COALESCE(sum(amount_minor),0)::text AS s FROM fee_collections WHERE brokerage_account_id = $1 AND status <> 'collected'", [a.id]))!.s);
          const expected = led.minor.total + uncollected;
          const actual = roundToMinor(new Decimal(bal.cash), a.currency, Decimal.ROUND_HALF_EVEN);
          if (expected !== actual) {
            await addBreak({
              kind: 'cash', userId: a.user_id, accountId: a.id, expected: fromMinor(expected, a.currency), actual: fromMinor(actual, a.currency),
              difference: fromMinor(actual - expected, a.currency), details: { ledger: { ...led, minor: undefined }, uncollectedFees: fromMinor(uncollected, a.currency) },
            });
          }
          // Positions: partner quantity vs net executed quantity recorded from partner executions.
          const ours = await this.db.query<{ symbol: string; q: string }>(
            `SELECT i.symbol, sum(CASE WHEN e.side = 'buy' THEN e.quantity ELSE -e.quantity END)::text AS q
               FROM executions e JOIN orders o ON o.id = e.order_id JOIN instruments i ON i.id = o.instrument_id
              WHERE o.brokerage_account_id = $1 GROUP BY i.symbol`,
            [a.id],
          );
          const symbols = new Set([...ours.map((o) => o.symbol), ...positions.map((p) => p.symbol)]);
          for (const s of symbols) {
            const mine = new Decimal(ours.find((o) => o.symbol === s)?.q ?? 0);
            const theirs = new Decimal(positions.find((p) => p.symbol === s)?.quantity ?? 0);
            if (!mine.eq(theirs)) {
              await addBreak({ kind: 'position', userId: a.user_id, accountId: a.id, reference: s, expected: mine.toString(), actual: theirs.toString(), difference: theirs.sub(mine).toString() });
            }
          }
        } catch (e) {
          await addBreak({ kind: 'partner_unreachable', userId: a.user_id, accountId: a.id, expected: 'response', actual: (e as Error).message });
        }
      }
      // Orders stuck without partner confirmation.
      const stuck = await this.db.query<{ id: string; user_id: string; brokerage_account_id: string }>(
        "SELECT id, user_id, brokerage_account_id FROM orders WHERE status = 'pending_submit' AND created_at < now() - interval '15 minutes'",
      );
      for (const o of stuck) await addBreak({ kind: 'order_unconfirmed', userId: o.user_id, accountId: o.brokerage_account_id, reference: o.id, expected: 'partner order', actual: 'none' });

      const summary = { accountsChecked: checked, breaks, trialBalanceOk: tbOk };
      await this.db.query("UPDATE reconciliation_runs SET status = 'completed', finished_at = now(), summary = $2 WHERE id = $1", [run.id, JSON.stringify(summary)]);
      if (breaks) this.logger.warn(`reconciliation ${run.id}: ${breaks} break(s)`);
      return { runId: run.id, ...summary };
    } catch (e) {
      await this.db.query("UPDATE reconciliation_runs SET status = 'failed', finished_at = now(), summary = $2 WHERE id = $1", [run.id, JSON.stringify({ error: (e as Error).message })]);
      throw e;
    }
  }
}
