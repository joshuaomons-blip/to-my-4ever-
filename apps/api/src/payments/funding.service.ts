import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors';
import { fromMinor, money, toMinor } from '../common/money';
import { AppRequest } from '../common/request-context';
import { EligibilityService } from '../compliance/eligibility.service';
import { DbService } from '../database/db.service';
import { BrokerageService } from '../brokerage/brokerage.service';
import { FeeService } from '../fees/fee.service';
import { JobsService } from '../jobs/jobs.service';
import { LedgerService, cr, dr, move } from '../ledger/ledger.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { NotificationService } from '../notifications/mailer.service';
import { PAYMENT_ADAPTER, PaymentAdapter, PaymentWebhookEvent } from './payment-adapter';

export const DEPOSIT_LIMITS = { minMinor: 100n, maxPerTxnMinor: 5_000_000n, maxPerDayMinor: 10_000_000n };

interface DepositRow { id: string; user_id: string; amount_minor: bigint; currency: string; status: string; provider_payment_id: string | null; created_at: Date; settled_at: Date | null; failure_reason: string | null }
interface WithdrawalRow { id: string; user_id: string; amount_minor: bigint; fee_minor: bigint; currency: string; status: string; payment_method_id: string; provider_payout_id: string | null; requires_review: boolean; created_at: Date; failure_reason: string | null; review_note: string | null }

@Injectable()
export class FundingService {
  private readonly logger = new Logger('Funding');

  constructor(
    private readonly db: DbService,
    @Inject(PAYMENT_ADAPTER) private readonly payments: PaymentAdapter,
    private readonly brokerage: BrokerageService,
    private readonly ledger: LedgerService,
    private readonly fees: FeeService,
    private readonly eligibility: EligibilityService,
    private readonly jobs: JobsService,
    private readonly monitoring: MonitoringService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async methods(userId: string) {
    return this.db.query(
      "SELECT id, type, label, last4, currency, status, created_at FROM payment_methods WHERE user_id = $1 AND status <> 'disabled' ORDER BY created_at",
      [userId],
    );
  }

  async addMethod(userId: string, dto: { type: 'bank_account' | 'card' | 'mobile_money' | 'wallet'; label: string; last4: string; currency: string }, req: AppRequest) {
    await this.eligibility.assertCapability(userId, 'deposits', this.cfg.operatingMode);
    await this.assertCurrencyAllowed(userId, dto.currency);
    const holder = await this.db.one<{ n: string }>("SELECT legal_first_name || ' ' || legal_last_name AS n FROM customer_profiles WHERE user_id = $1", [userId]);
    const pm = await this.payments.addPaymentMethod({ userId, ...dto, holderName: holder?.n ?? '' });
    const row = await this.db.tx(async (c) => {
      const r = (
        await c.query<{ id: string }>(
          `INSERT INTO payment_methods (user_id, provider, provider_method_id, type, label, last4, currency, status, verified_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'verified' THEN now() END) RETURNING id`,
          [userId, this.payments.name, pm.providerMethodId, dto.type, dto.label, dto.last4, dto.currency, pm.verified ? 'verified' : 'pending_verification'],
        )
      ).rows[0]!;
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'funding.method_added', targetType: 'payment_method', targetId: r.id, metadata: { type: dto.type, last4: dto.last4 }, req }, c);
      return r;
    });
    return { id: row.id, status: pm.verified ? 'verified' : 'pending_verification' };
  }

  private async assertCurrencyAllowed(userId: string, currency: string): Promise<void> {
    const j = await this.db.one<{ allowed_currencies: string[] }>(
      'SELECT j.allowed_currencies FROM customer_profiles p JOIN jurisdictions j ON j.code = p.residence_country WHERE p.user_id = $1',
      [userId],
    );
    if (!j?.allowed_currencies.includes(currency)) throw new AppError('CURRENCY_NOT_SUPPORTED', `${currency} is not supported for your country`, 422);
    // Brokerage accounts are USD-denominated with the current partner; FX conversion is a planned integration.
    if (currency !== 'USD') {
      throw new AppError('FX_NOT_AVAILABLE', `Funding in ${currency} requires currency conversion, which is not yet enabled. Please use USD.`, 422);
    }
  }

  private async method(userId: string, id: string) {
    const m = await this.db.one<{ id: string; provider_method_id: string; status: string; currency: string }>(
      'SELECT id, provider_method_id, status, currency FROM payment_methods WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!m) throw new AppError('NOT_FOUND', 'Payment method not found', 404);
    if (m.status !== 'verified') throw new AppError('PAYMENT_METHOD_UNVERIFIED', 'Payment method is not verified', 422);
    return m;
  }

  async createDeposit(userId: string, dto: { amount: string; currency: string; paymentMethodId: string }, idempotencyKey: string, req: AppRequest) {
    const prior = await this.db.one<DepositRow>('SELECT * FROM deposits WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
    if (prior) return this.presentDeposit(prior);
    await this.eligibility.assertCapability(userId, 'deposits', this.cfg.operatingMode);
    await this.brokerage.requireActiveAccount(userId);
    await this.assertCurrencyAllowed(userId, dto.currency);
    const m = await this.method(userId, dto.paymentMethodId);
    if (m.currency !== dto.currency) throw new AppError('CURRENCY_MISMATCH', 'Payment method currency does not match', 422);
    const amount = toMinor(dto.amount, dto.currency);
    if (amount < DEPOSIT_LIMITS.minMinor) throw new AppError('AMOUNT_TOO_SMALL', `Minimum deposit is ${fromMinor(DEPOSIT_LIMITS.minMinor, dto.currency)}`, 422);
    if (amount > DEPOSIT_LIMITS.maxPerTxnMinor) throw new AppError('AMOUNT_TOO_LARGE', `Maximum deposit is ${fromMinor(DEPOSIT_LIMITS.maxPerTxnMinor, dto.currency)}`, 422);
    const today = await this.db.one<{ s: string }>(
      "SELECT COALESCE(sum(amount_minor),0)::text AS s FROM deposits WHERE user_id = $1 AND status NOT IN ('failed','canceled') AND created_at > now() - interval '1 day'",
      [userId],
    );
    if (BigInt(today!.s) + amount > DEPOSIT_LIMITS.maxPerDayMinor) throw new AppError('DAILY_LIMIT_EXCEEDED', 'Daily deposit limit exceeded', 422);

    const dep = await this.db.tx(async (c) => {
      const r = await c.query<DepositRow>(
        `INSERT INTO deposits (user_id, payment_method_id, amount_minor, currency, provider, idempotency_key, status)
         VALUES ($1,$2,$3,$4,$5,$6,'initiated') ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
        [userId, m.id, amount.toString(), dto.currency, this.payments.name, idempotencyKey],
      );
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'funding.deposit_initiated', targetType: 'deposit', targetId: r.rows[0]?.id, metadata: { amount: dto.amount, currency: dto.currency }, req }, c);
      return r.rows[0];
    });
    if (!dep) return this.presentDeposit((await this.db.one<DepositRow>('SELECT * FROM deposits WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]))!);

    let payment;
    try {
      payment = await this.payments.createDeposit({ reference: `deposit:${dep.id}`, amountMinor: amount, currency: dto.currency, providerMethodId: m.provider_method_id });
    } catch (e) {
      await this.db.query("UPDATE deposits SET status = 'failed', failure_reason = $2 WHERE id = $1", [dep.id, 'Payment provider unavailable']);
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 'The payment provider is unavailable. No funds were moved.', 503);
    }
    await this.db.tx(async (c) => {
      const locked = (await c.query<DepositRow>('SELECT * FROM deposits WHERE id = $1 FOR UPDATE', [dep.id])).rows[0]!;
      await c.query('UPDATE deposits SET provider_payment_id = $2 WHERE id = $1', [dep.id, payment.providerId]);
      if (locked.status === 'initiated') {
        await c.query("UPDATE deposits SET status = 'pending' WHERE id = $1", [dep.id]);
        await this.ledger.post(c, {
          idempotencyKey: `deposit-pending:${dep.id}`, kind: 'deposit_pending', description: 'Deposit initiated',
          referenceType: 'deposit', referenceId: dep.id, createdBy: { type: 'system' },
          legs: [dr({ type: 'payment_clearing', currency: dto.currency }, amount), cr({ owner: userId, type: 'customer_pending', currency: dto.currency }, amount)],
        });
      }
    });
    return this.presentDeposit((await this.db.one<DepositRow>('SELECT * FROM deposits WHERE id = $1', [dep.id]))!, payment.nextAction ?? null);
  }

  /** Job: payment confirmed by provider → fund partner account → make cash available. */
  async settleDeposit(depositId: string): Promise<void> {
    const d = await this.db.one<DepositRow>('SELECT * FROM deposits WHERE id = $1', [depositId]);
    if (!d || d.status !== 'pending') return;
    const acct = await this.brokerage.requireActiveAccount(d.user_id);
    const amount = BigInt(d.amount_minor);
    // Idempotent on reference: retries never double-fund.
    const t = await this.brokerage.adapter.transferCash(acct.provider_account_id, 'credit', fromMinor(amount, d.currency), d.currency, `deposit:${d.id}`);
    if (t.status === 'rejected') throw new Error('partner rejected funding journal');
    await this.db.tx(async (c) => {
      const locked = (await c.query<DepositRow>('SELECT * FROM deposits WHERE id = $1 FOR UPDATE', [d.id])).rows[0]!;
      if (locked.status !== 'pending') return;
      await this.ledger.post(c, {
        idempotencyKey: `deposit-settled:${d.id}`, kind: 'deposit_settled', description: 'Deposit settled and credited to brokerage account',
        referenceType: 'deposit', referenceId: d.id, createdBy: { type: 'system' },
        legs: [
          ...move({ owner: d.user_id, type: 'customer_pending', currency: d.currency }, { owner: d.user_id, type: 'customer_available', currency: d.currency }, amount),
          dr({ type: 'broker_settlement', currency: d.currency }, amount),
          cr({ type: 'payment_clearing', currency: d.currency }, amount),
        ],
      });
      await c.query("UPDATE deposits SET status = 'settled', settled_at = now() WHERE id = $1", [d.id]);
      await this.monitoring.onDepositSettled(c, d.user_id, d.id, amount);
      await this.notifications.notify(d.user_id, 'funding', 'Deposit available', `${fromMinor(amount, d.currency)} ${d.currency} is now available to invest.`, { depositId: d.id }, c);
      await this.jobs.enqueue(c, 'brokerage.sync_account', { brokerageAccountId: acct.id }, { dedupeKey: `sync:${acct.id}` });
    });
  }

  private async failDeposit(d: DepositRow, reason: string, returned: boolean): Promise<void> {
    await this.db.tx(async (c) => {
      const locked = (await c.query<DepositRow>('SELECT * FROM deposits WHERE id = $1 FOR UPDATE', [d.id])).rows[0]!;
      if (locked.status === 'pending' || locked.status === 'initiated') {
        if (locked.status === 'pending') {
          await this.ledger.post(c, {
            idempotencyKey: `deposit-failed:${d.id}`, kind: 'deposit_failed', description: `Deposit failed: ${reason}`,
            referenceType: 'deposit', referenceId: d.id, createdBy: { type: 'provider', id: this.payments.name },
            legs: [dr({ owner: d.user_id, type: 'customer_pending', currency: d.currency }, BigInt(d.amount_minor)), cr({ type: 'payment_clearing', currency: d.currency }, BigInt(d.amount_minor))],
          });
        }
        await c.query("UPDATE deposits SET status = 'failed', failure_reason = $2 WHERE id = $1", [d.id, reason]);
        await this.notifications.notify(d.user_id, 'funding', 'Deposit failed', reason, { depositId: d.id }, c);
      } else if (locked.status === 'settled' && returned) {
        // A settled payment was reversed by the bank (e.g. ACH return). Never silently claw back:
        // restrict and alert operations to handle per policy.
        await c.query(
          `INSERT INTO account_restrictions (user_id, type, reason) VALUES ($1,'withdrawal_block',$2)`,
          [d.user_id, `Deposit ${d.id} returned by payment provider: ${reason}`],
        );
        await c.query(
          "INSERT INTO monitoring_alerts (user_id, rule, severity, details, dedupe_key) VALUES ($1,'deposit_returned','critical',$2,$3) ON CONFLICT DO NOTHING",
          [d.user_id, JSON.stringify({ depositId: d.id, reason }), `returned:${d.id}`],
        );
        await c.query("UPDATE deposits SET status = 'returned', failure_reason = $2 WHERE id = $1", [d.id, reason]);
      }
    });
  }

  async createWithdrawal(userId: string, dto: { amount: string; currency: string; paymentMethodId: string }, idempotencyKey: string, req: AppRequest) {
    const prior = await this.db.one<WithdrawalRow>('SELECT * FROM withdrawals WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
    if (prior) return this.presentWithdrawal(prior);
    await this.eligibility.assertCapability(userId, 'withdrawals', this.cfg.operatingMode);
    await this.brokerage.requireActiveAccount(userId);
    const m = await this.method(userId, dto.paymentMethodId);
    if (m.currency !== dto.currency) throw new AppError('CURRENCY_MISMATCH', 'Payment method currency does not match', 422);
    // Closed-loop rule: withdraw only to a verified method that has funded the account.
    const funded = await this.db.one("SELECT 1 FROM deposits WHERE user_id = $1 AND payment_method_id = $2 AND status = 'settled' LIMIT 1", [userId, m.id]);
    if (!funded) throw new AppError('WITHDRAWAL_DESTINATION_NOT_ALLOWED', 'Withdrawals can only be sent to a method you have deposited from', 422);
    const amount = toMinor(dto.amount, dto.currency);
    if (amount < 100n) throw new AppError('AMOUNT_TOO_SMALL', 'Minimum withdrawal is 1.00', 422);
    const schedule = await this.fees.active(dto.currency);
    const fee = schedule.withdrawal_fee_minor;
    const firstWithdrawal = !(await this.db.one("SELECT 1 FROM withdrawals WHERE user_id = $1 AND status = 'completed' LIMIT 1", [userId]));

    const withdrawalId = randomUUID();
    const w = await this.db.tx(async (c) => {
      const flagged = await this.monitoring.onWithdrawalRequested(c, userId, withdrawalId);
      const requiresReview = amount >= this.cfg.withdrawalReviewThresholdMinor || firstWithdrawal || flagged;
      const r = await c.query<WithdrawalRow>(
        `INSERT INTO withdrawals (id, user_id, payment_method_id, amount_minor, fee_minor, currency, provider, idempotency_key, status, requires_review)
         VALUES ($10,$1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
        [userId, m.id, amount.toString(), fee.toString(), dto.currency, this.payments.name, idempotencyKey, requiresReview ? 'pending_review' : 'approved', requiresReview, withdrawalId],
      );
      const row = r.rows[0];
      if (!row) return undefined;
      // Fails with INSUFFICIENT_FUNDS if available cash is too low (including concurrent requests).
      await this.ledger.post(c, {
        idempotencyKey: `withdrawal-hold:${row.id}`, kind: 'withdrawal_hold', description: 'Withdrawal requested',
        referenceType: 'withdrawal', referenceId: row.id, createdBy: { type: 'system' },
        legs: move({ owner: userId, type: 'customer_available', currency: dto.currency }, { owner: userId, type: 'customer_withdrawal_hold', currency: dto.currency }, amount + fee),
      });
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'funding.withdrawal_requested', targetType: 'withdrawal', targetId: row.id, metadata: { amount: dto.amount, requiresReview }, req }, c);
      if (!requiresReview) await this.jobs.enqueue(c, 'withdrawals.process', { withdrawalId: row.id });
      return row;
    });
    if (!w) return this.presentWithdrawal((await this.db.one<WithdrawalRow>('SELECT * FROM withdrawals WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]))!);
    return this.presentWithdrawal(w);
  }

  async cancelWithdrawal(userId: string, id: string, req: AppRequest) {
    await this.db.tx(async (c) => {
      const w = (await c.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId])).rows[0];
      if (!w) throw new AppError('NOT_FOUND', 'Withdrawal not found', 404);
      if (!['pending_review', 'approved'].includes(w.status)) throw new AppError('WITHDRAWAL_NOT_CANCELABLE', 'This withdrawal can no longer be canceled', 409);
      await this.releaseWithdrawalHold(c, w, 'canceled');
      await c.query("UPDATE withdrawals SET status = 'canceled' WHERE id = $1", [id]);
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'funding.withdrawal_canceled', targetType: 'withdrawal', targetId: id, req }, c);
    });
  }

  private async releaseWithdrawalHold(c: Parameters<LedgerService['post']>[0], w: WithdrawalRow, why: string) {
    await this.ledger.post(c, {
      idempotencyKey: `withdrawal-release:${w.id}`, kind: 'withdrawal_release', description: `Withdrawal ${why}; funds returned to available`,
      referenceType: 'withdrawal', referenceId: w.id, createdBy: { type: 'system' },
      legs: move({ owner: w.user_id, type: 'customer_withdrawal_hold', currency: w.currency }, { owner: w.user_id, type: 'customer_available', currency: w.currency }, BigInt(w.amount_minor) + BigInt(w.fee_minor)),
    });
  }

  /** Staff decision on a withdrawal under review (maker-checker enforced by caller permissions). */
  async reviewWithdrawal(staffId: string, id: string, decision: 'approve' | 'reject', note: string, req: AppRequest) {
    await this.db.tx(async (c) => {
      const w = (await c.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!w) throw new AppError('NOT_FOUND', 'Withdrawal not found', 404);
      if (w.status !== 'pending_review') throw new AppError('INVALID_STATE', `Withdrawal is ${w.status}`, 409);
      if (decision === 'approve') {
        await c.query("UPDATE withdrawals SET status = 'approved', reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1", [id, staffId, note]);
        await this.jobs.enqueue(c, 'withdrawals.process', { withdrawalId: id });
      } else {
        await this.releaseWithdrawalHold(c, w, 'rejected');
        await c.query("UPDATE withdrawals SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1", [id, staffId, note]);
        await this.notifications.notify(w.user_id, 'funding', 'Withdrawal not approved', 'Your withdrawal was not approved. Please contact support for details.', { withdrawalId: id }, c);
      }
      await this.audit.record({ actorType: 'staff', actorId: staffId, action: `funding.withdrawal_${decision}d`, targetType: 'withdrawal', targetId: id, metadata: { note }, req }, c);
    });
  }

  /** Job: debit partner account (idempotent), record ledger, request payout. */
  async processWithdrawal(id: string): Promise<void> {
    const w = await this.db.one<WithdrawalRow & { provider_method_id: string }>(
      'SELECT w.*, m.provider_method_id FROM withdrawals w JOIN payment_methods m ON m.id = w.payment_method_id WHERE w.id = $1',
      [id],
    );
    if (!w || w.status !== 'approved') return;
    await this.eligibility.assertCapability(w.user_id, 'withdrawals', this.cfg.operatingMode).catch(async (e) => {
      // A restriction applied after approval stops the payout; funds stay on hold for review.
      await this.db.query("UPDATE withdrawals SET status = 'pending_review', review_note = $2 WHERE id = $1", [id, `Re-review: ${(e as Error).message}`]);
      throw e;
    });
    const acct = await this.brokerage.requireActiveAccount(w.user_id);
    const total = BigInt(w.amount_minor) + BigInt(w.fee_minor);
    const t = await this.brokerage.adapter.transferCash(acct.provider_account_id, 'debit', fromMinor(total, w.currency), w.currency, `withdrawal:${w.id}`);
    if (t.status === 'rejected') {
      await this.db.tx(async (c) => {
        await this.releaseWithdrawalHold(c, w, 'failed');
        await c.query("UPDATE withdrawals SET status = 'failed', failure_reason = 'Partner rejected cash transfer' WHERE id = $1", [id]);
      });
      return;
    }
    await this.db.tx(async (c) => {
      const locked = (await c.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id])).rows[0]!;
      if (locked.status !== 'approved') return;
      await this.ledger.post(c, {
        idempotencyKey: `withdrawal-debit:${w.id}`, kind: 'withdrawal_debited', description: 'Withdrawal debited from brokerage account',
        referenceType: 'withdrawal', referenceId: w.id, createdBy: { type: 'system' },
        legs: [
          dr({ owner: w.user_id, type: 'customer_withdrawal_hold', currency: w.currency }, total),
          cr({ type: 'broker_settlement', currency: w.currency }, BigInt(w.amount_minor)),
          cr({ type: 'platform_fee_revenue', currency: w.currency }, BigInt(w.fee_minor)),
        ],
      });
      await c.query("UPDATE withdrawals SET status = 'processing' WHERE id = $1", [id]);
    });
    const payout = await this.payments.createPayout({ reference: `withdrawal:${w.id}`, amountMinor: BigInt(w.amount_minor), currency: w.currency, providerMethodId: w.provider_method_id });
    await this.db.query('UPDATE withdrawals SET provider_payout_id = $2 WHERE id = $1 AND provider_payout_id IS NULL', [id, payout.providerId]);
  }

  /** Verified provider webhook → state change. Duplicate events are ignored via webhook_events uniqueness. */
  async handlePaymentEvent(e: PaymentWebhookEvent): Promise<void> {
    if (e.type.startsWith('payment.')) {
      const d = await this.db.one<DepositRow>('SELECT * FROM deposits WHERE provider = $1 AND provider_payment_id = $2', [this.payments.name, e.providerId]);
      if (!d) throw new Error(`deposit for ${e.providerId} not found yet`); // retried (provider id written just after creation)
      if (e.type === 'payment.succeeded') await this.jobs.enqueue(this.db.pool, 'deposits.settle', { depositId: d.id }, { dedupeKey: `settle:${d.id}` });
      else await this.failDeposit(d, e.failureReason ?? 'Payment failed', e.type === 'payment.returned');
      return;
    }
    const w = await this.db.one<WithdrawalRow>('SELECT * FROM withdrawals WHERE provider = $1 AND provider_payout_id = $2', [this.payments.name, e.providerId]);
    if (!w) throw new Error(`withdrawal for ${e.providerId} not found yet`);
    await this.db.tx(async (c) => {
      const locked = (await c.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [w.id])).rows[0]!;
      if (locked.status !== 'processing') return;
      if (e.type === 'payout.completed') {
        await c.query("UPDATE withdrawals SET status = 'completed', completed_at = now() WHERE id = $1", [w.id]);
        await this.notifications.notify(w.user_id, 'funding', 'Withdrawal sent', `${fromMinor(BigInt(w.amount_minor), w.currency)} ${w.currency} has been sent.`, { withdrawalId: w.id }, c);
      } else {
        await c.query("UPDATE withdrawals SET status = 'failed', failure_reason = $2 WHERE id = $1", [w.id, e.failureReason ?? 'Payout failed']);
        await this.jobs.enqueue(c, 'withdrawals.return_funds', { withdrawalId: w.id });
      }
    });
  }

  /** Job: payout failed after the partner was debited → re-credit partner, reverse debit, release hold. */
  async returnWithdrawalFunds(id: string): Promise<void> {
    const w = await this.db.one<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = $1', [id]);
    if (!w || w.status !== 'failed') return;
    const acct = await this.brokerage.requireActiveAccount(w.user_id);
    const total = BigInt(w.amount_minor) + BigInt(w.fee_minor);
    await this.brokerage.adapter.transferCash(acct.provider_account_id, 'credit', fromMinor(total, w.currency), w.currency, `withdrawal-return:${w.id}`);
    await this.db.tx(async (c) => {
      const debit = (await c.query<{ id: string }>("SELECT id FROM journal_entries WHERE idempotency_key = $1", [`withdrawal-debit:${w.id}`])).rows[0];
      const already = (await c.query("SELECT 1 FROM journal_entries WHERE idempotency_key = $1", [`withdrawal-release:${w.id}`])).rows[0];
      if (!debit || already) return;
      await this.ledger.reverse(c, debit.id, 'Payout failed; reversing withdrawal debit', { type: 'system' });
      await this.releaseWithdrawalHold(c, w, 'failed');
      await this.notifications.notify(w.user_id, 'funding', 'Withdrawal failed', `${w.failure_reason ?? 'The payout failed'}. Funds have been returned to your available cash.`, { withdrawalId: w.id }, c);
    });
  }

  presentDeposit(d: DepositRow, nextAction: unknown = null) {
    return { id: d.id, amount: money(BigInt(d.amount_minor), d.currency), status: d.status, failureReason: d.failure_reason, createdAt: d.created_at, settledAt: d.settled_at, nextAction };
  }

  presentWithdrawal(w: WithdrawalRow) {
    return {
      id: w.id, amount: money(BigInt(w.amount_minor), w.currency), fee: money(BigInt(w.fee_minor), w.currency), status: w.status,
      requiresReview: w.requires_review, failureReason: w.failure_reason, createdAt: w.created_at,
    };
  }

  async history(userId: string) {
    const [deposits, withdrawals] = await Promise.all([
      this.db.query<DepositRow>('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]),
      this.db.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]),
    ]);
    return { deposits: deposits.map((d) => this.presentDeposit(d)), withdrawals: withdrawals.map((w) => this.presentWithdrawal(w)) };
  }
}
