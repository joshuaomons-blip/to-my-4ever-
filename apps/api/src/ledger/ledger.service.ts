import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../database/db.service';
import { AppError } from '../common/errors';
import { fromMinor } from '../common/money';

export type CustomerAccountType =
  | 'customer_available'
  | 'customer_pending'
  | 'customer_held'
  | 'customer_unsettled'
  | 'customer_withdrawal_hold'
  | 'customer_deficit';

export type PlatformAccountType = 'platform_fee_revenue' | 'payment_clearing' | 'broker_settlement';

export type AccountRef =
  | { owner: string; type: CustomerAccountType; currency: string }
  | { owner?: undefined; type: PlatformAccountType; currency: string };

export interface Leg {
  account: AccountRef;
  /** Positive = debit, negative = credit (minor units). */
  amount: bigint;
}

export interface JournalInput {
  idempotencyKey: string;
  kind: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  reversesEntryId?: string;
  createdBy: { type: 'system' | 'staff' | 'provider'; id?: string };
  legs: Leg[];
}

const NORMAL: Record<string, 'debit' | 'credit'> = {
  customer_available: 'credit',
  customer_pending: 'credit',
  customer_held: 'credit',
  customer_unsettled: 'credit',
  customer_withdrawal_hold: 'credit',
  customer_deficit: 'debit',
};

export interface CustomerBalances {
  currency: string;
  available: string;
  pending: string;
  held: string;
  unsettled: string;
  withdrawalHold: string;
  deficit: string;
  /** Total platform-recorded cash attributable to the customer (all buckets net of deficit). */
  total: string;
  minor: Record<'available' | 'pending' | 'held' | 'unsettled' | 'withdrawalHold' | 'deficit' | 'total', bigint>;
}

/** Helper for the common "move X from A to B" (credit-normal customer buckets). */
export const move = (from: AccountRef, to: AccountRef, amount: bigint): Leg[] => {
  if (amount <= 0n) throw new Error('move amount must be positive');
  // Moving value OUT of a credit-normal account = debit it; INTO = credit it. For debit-normal the reverse.
  const out = (a: AccountRef) => (isCreditNormal(a) ? amount : -amount);
  return [
    { account: from, amount: out(from) },
    { account: to, amount: -out(to) },
  ];
};

export function isCreditNormal(a: AccountRef): boolean {
  if (a.owner) return NORMAL[a.type] === 'credit';
  return a.type === 'platform_fee_revenue';
}

/**
 * Double-entry ledger. Invariants are enforced in PostgreSQL (balanced entries, no negative customer
 * balances, append-only history); this service adds idempotency and convenient posting helpers.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly db: DbService) {}

  private async accountId(q: Queryable, ref: AccountRef): Promise<string> {
    if (ref.owner) {
      const r = await q.query<{ id: string }>(
        `INSERT INTO ledger_accounts (owner_user_id, type, currency, normal_balance, allow_negative)
         VALUES ($1,$2,$3,$4,false)
         ON CONFLICT (owner_user_id, type, currency) WHERE owner_user_id IS NOT NULL DO UPDATE SET type = EXCLUDED.type
         RETURNING id`,
        [ref.owner, ref.type, ref.currency, NORMAL[ref.type]],
      );
      return r.rows[0]!.id;
    }
    const r = await q.query<{ id: string }>('SELECT id FROM ledger_accounts WHERE owner_user_id IS NULL AND type = $1 AND currency = $2', [ref.type, ref.currency]);
    if (!r.rows[0]) throw new Error(`Platform ledger account ${ref.type}/${ref.currency} missing`);
    return r.rows[0].id;
  }

  /**
   * Post a balanced journal entry inside the caller's transaction. Returns the entry id, or the existing
   * id if this idempotency key was already posted (safe for retries and duplicate events).
   */
  async post(q: Queryable, input: JournalInput): Promise<{ entryId: string; duplicate: boolean }> {
    const legs = input.legs.filter((l) => l.amount !== 0n);
    if (legs.length < 2) throw new Error('journal requires at least two non-zero legs');
    const byCcy = new Map<string, bigint>();
    for (const l of legs) byCcy.set(l.account.currency, (byCcy.get(l.account.currency) ?? 0n) + l.amount);
    for (const [ccy, sum] of byCcy) if (sum !== 0n) throw new Error(`unbalanced journal in ${ccy}: ${sum}`);

    const ins = await q.query<{ id: string }>(
      `INSERT INTO journal_entries (idempotency_key, kind, description, reference_type, reference_id, reverses_entry_id, created_by_type, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [input.idempotencyKey, input.kind, input.description, input.referenceType ?? null, input.referenceId ?? null, input.reversesEntryId ?? null, input.createdBy.type, input.createdBy.id ?? null],
    );
    if (!ins.rows[0]) {
      const existing = await q.query<{ id: string }>('SELECT id FROM journal_entries WHERE idempotency_key = $1', [input.idempotencyKey]);
      return { entryId: existing.rows[0]!.id, duplicate: true };
    }
    const entryId = ins.rows[0].id;
    // Lock accounts in a stable order to avoid deadlocks between concurrent journals.
    const resolved = await Promise.all(legs.map(async (l) => ({ id: await this.accountId(q, l.account), leg: l })));
    resolved.sort((a, b) => a.id.localeCompare(b.id));
    for (const r of resolved) {
      await q.query('INSERT INTO ledger_postings (journal_entry_id, ledger_account_id, amount_minor, currency) VALUES ($1,$2,$3,$4)', [
        entryId, r.id, r.leg.amount.toString(), r.leg.account.currency,
      ]);
    }
    return { entryId, duplicate: false };
  }

  /** Reverse a prior entry exactly (used for corrections; the original is never altered). */
  async reverse(q: Queryable, entryId: string, reason: string, by: JournalInput['createdBy']): Promise<string> {
    const postings = await q.query<{ ledger_account_id: string; amount_minor: bigint; currency: string }>(
      'SELECT ledger_account_id, amount_minor, currency FROM ledger_postings WHERE journal_entry_id = $1',
      [entryId],
    );
    if (!postings.rows.length) throw new AppError('NOT_FOUND', 'Journal entry not found', 404);
    const ins = await q.query<{ id: string }>(
      `INSERT INTO journal_entries (idempotency_key, kind, description, reverses_entry_id, created_by_type, created_by_id)
       VALUES ($1,'reversal',$2,$3,$4,$5) RETURNING id`,
      [`reversal:${entryId}`, reason, entryId, by.type, by.id ?? null],
    );
    const rid = ins.rows[0]!.id;
    const sorted = [...postings.rows].sort((a, b) => a.ledger_account_id.localeCompare(b.ledger_account_id));
    for (const p of sorted) {
      await q.query('INSERT INTO ledger_postings (journal_entry_id, ledger_account_id, amount_minor, currency) VALUES ($1,$2,$3,$4)', [
        rid, p.ledger_account_id, (-BigInt(p.amount_minor)).toString(), p.currency,
      ]);
    }
    return rid;
  }

  /** Customer-facing balances (positive numbers) for one currency. */
  async customerBalances(userId: string, currency: string, q: Queryable = this.db.pool): Promise<CustomerBalances> {
    const rows = (
      await q.query<{ type: CustomerAccountType; balance_minor: bigint }>(
        `SELECT a.type, COALESCE(b.balance_minor, 0) AS balance_minor
           FROM ledger_accounts a LEFT JOIN ledger_balances b ON b.ledger_account_id = a.id
          WHERE a.owner_user_id = $1 AND a.currency = $2`,
        [userId, currency],
      )
    ).rows;
    const get = (t: CustomerAccountType) => {
      const r = rows.find((x) => x.type === t);
      const v = r ? BigInt(r.balance_minor) : 0n;
      return NORMAL[t] === 'credit' ? -v : v;
    };
    const minor = {
      available: get('customer_available'),
      pending: get('customer_pending'),
      held: get('customer_held'),
      unsettled: get('customer_unsettled'),
      withdrawalHold: get('customer_withdrawal_hold'),
      deficit: get('customer_deficit'),
      total: 0n,
    };
    minor.total = minor.available + minor.held + minor.unsettled + minor.withdrawalHold - minor.deficit;
    const f = (v: bigint) => fromMinor(v, currency);
    return {
      currency,
      available: f(minor.available),
      pending: f(minor.pending),
      held: f(minor.held),
      unsettled: f(minor.unsettled),
      withdrawalHold: f(minor.withdrawalHold),
      deficit: f(minor.deficit),
      total: f(minor.total),
      minor,
    };
  }

  /** Lock the customer's available-cash balance row so concurrent holds serialise. */
  async lockAvailable(q: Queryable, userId: string, currency: string): Promise<void> {
    const id = await this.accountId(q, { owner: userId, type: 'customer_available', currency });
    await q.query('SELECT 1 FROM ledger_accounts WHERE id = $1 FOR UPDATE', [id]);
  }

  /** Global integrity check: every currency's postings must sum to zero. */
  async trialBalance(q: Queryable = this.db.pool): Promise<Array<{ currency: string; sum: string; balanced: boolean }>> {
    const rows = (await q.query<{ currency: string; s: string }>('SELECT currency, sum(amount_minor)::text AS s FROM ledger_postings GROUP BY currency')).rows;
    return rows.map((r) => ({ currency: r.currency, sum: r.s, balanced: r.s === '0' }));
  }
}

/** Explicit debit / credit leg helpers (amount in positive minor units). */
export const dr = (account: AccountRef, amount: bigint): Leg => ({ account, amount });
export const cr = (account: AccountRef, amount: bigint): Leg => ({ account, amount: -amount });
