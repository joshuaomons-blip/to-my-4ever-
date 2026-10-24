import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors';
import { Decimal, fromMinor, money, roundToMinor } from '../common/money';
import { AppRequest } from '../common/request-context';
import { EligibilityService } from '../compliance/eligibility.service';
import { DbService, Queryable } from '../database/db.service';
import { BrokerError, BrokerOrder } from '../brokerage/broker-adapter';
import { BrokerageService } from '../brokerage/brokerage.service';
import { FeeService, commissionFor } from '../fees/fee.service';
import { JobsService } from '../jobs/jobs.service';
import { LedgerService, cr, dr, move } from '../ledger/ledger.service';
import { MarketDataService, QuoteWithFreshness } from '../market-data/market-data.service';
import { NotificationService } from '../notifications/mailer.service';
import { OrderRequestDto } from './orders.dto';
import { OPEN, OrderStatus, TERMINAL, canTransition } from './order-state';

/** Extra reserve on market buys to absorb price movement between preview and fill. */
export const MARKET_BUY_COLLAR = new Decimal('0.05');
/** Reject limit/stop prices this far from the last price (fat-finger protection). */
export const PRICE_BAND = new Decimal('0.5');

export interface OrderRow {
  id: string;
  user_id: string;
  brokerage_account_id: string;
  instrument_id: string;
  client_order_id: string;
  idempotency_key: string;
  provider: string;
  provider_order_id: string | null;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  quantity: string;
  limit_price: string | null;
  stop_price: string | null;
  currency: string;
  status: OrderStatus;
  filled_quantity: string;
  avg_fill_price: string | null;
  estimated_price: string;
  estimated_fee_minor: bigint;
  hold_minor: bigint;
  quote_snapshot: unknown;
  reject_reason: string | null;
  submitted_at: Date | null;
  terminal_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InstrumentRow {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  is_tradable: boolean;
  fractionable: boolean;
  restricted_jurisdictions: string[];
}

export interface OrderPreview {
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  type: string;
  timeInForce: string;
  quantity: string;
  quote: QuoteWithFreshness;
  estimatedPrice: string;
  estimatedNotional: { amount: string; currency: string };
  estimatedCommission: { amount: string; currency: string };
  estimatedTotal: { amount: string; currency: string };
  reserveAmount: { amount: string; currency: string };
  availableCash: { amount: string; currency: string };
  warnings: string[];
  canSubmit: boolean;
  blockers: string[];
  disclosure: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly db: DbService,
    private readonly brokerage: BrokerageService,
    private readonly ledger: LedgerService,
    private readonly fees: FeeService,
    private readonly marketData: MarketDataService,
    private readonly eligibility: EligibilityService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private async instrument(symbol: string): Promise<InstrumentRow> {
    const i = await this.db.one<InstrumentRow>('SELECT * FROM instruments WHERE symbol = $1 ORDER BY exchange LIMIT 1', [symbol]);
    if (!i) throw new AppError('UNKNOWN_INSTRUMENT', `Unknown instrument ${symbol}`, 404);
    return i;
  }

  /** Validation shared by preview and placement. Returns blockers (hard) and warnings (soft). */
  private async evaluate(userId: string, dto: OrderRequestDto) {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const inst = await this.instrument(dto.symbol);
    const qty = new Decimal(dto.quantity);
    if (qty.lte(0)) blockers.push('Quantity must be greater than zero');
    if (!qty.isInteger() && !inst.fractionable) blockers.push(`${inst.symbol} does not support fractional shares`);
    if (!qty.isInteger() && dto.type !== 'market') blockers.push('Fractional quantities are only supported for market orders');
    if (['limit', 'stop_limit'].includes(dto.type) && !dto.limitPrice) blockers.push('Limit price is required');
    if (['stop', 'stop_limit'].includes(dto.type) && !dto.stopPrice) blockers.push('Stop price is required');
    if (dto.type === 'market' && (dto.limitPrice || dto.stopPrice)) blockers.push('Market orders cannot have limit or stop prices');
    if (!inst.is_tradable) blockers.push(`${inst.symbol} is not currently tradable`);

    const profile = await this.db.one<{ residence_country: string | null }>('SELECT residence_country FROM customer_profiles WHERE user_id = $1', [userId]);
    if (profile?.residence_country && inst.restricted_jurisdictions.includes(profile.residence_country)) {
      blockers.push(`${inst.symbol} is not available to residents of your country (e.g. no required product disclosure document)`);
    }

    const quote = await this.marketData.quote(inst.symbol);
    if (quote.stale) {
      if (dto.type === 'market') blockers.push(`Market data for ${inst.symbol} is stale (${quote.ageSeconds}s old). Market orders are disabled until prices refresh.`);
      else warnings.push(`Market data is ${quote.ageSeconds}s old; the reference price may not reflect the market.`);
    }
    if (quote.simulated) warnings.push('SANDBOX: prices are simulated and no real order will be placed.');
    const last = new Decimal(quote.last);
    for (const [label, p] of [['Limit', dto.limitPrice], ['Stop', dto.stopPrice]] as const) {
      if (p && new Decimal(p).sub(last).abs().div(last).gt(PRICE_BAND)) {
        blockers.push(`${label} price is more than ${PRICE_BAND.mul(100)}% away from the last price`);
      }
    }
    if (dto.timeInForce !== 'day' && !qty.isInteger()) blockers.push('Fractional orders must be day orders');

    const ref = dto.side === 'buy' ? new Decimal(quote.ask) : new Decimal(quote.bid);
    const estPrice = dto.limitPrice ? (dto.side === 'buy' ? Decimal.min(ref, dto.limitPrice) : Decimal.max(ref, dto.limitPrice)) : ref;
    const schedule = await this.fees.active(inst.currency);
    const notional = qty.mul(estPrice);
    const fee = commissionFor(notional, schedule);
    // Buy reserve: worst-case price (limit, or collar above ask for market/stop) plus commission.
    const worst = dto.limitPrice ? new Decimal(dto.limitPrice) : (dto.stopPrice ? Decimal.max(dto.stopPrice, ref) : ref).mul(MARKET_BUY_COLLAR.add(1));
    const reserveNotional = qty.mul(worst);
    const holdMinor = dto.side === 'buy' ? roundToMinor(reserveNotional, inst.currency) + commissionFor(reserveNotional, schedule) : 0n;
    return { inst, qty, quote, estPrice, notional, fee, holdMinor, blockers, warnings };
  }

  async preview(userId: string, dto: OrderRequestDto): Promise<OrderPreview> {
    await this.eligibility.assertCapability(userId, 'trading', this.cfg.operatingMode);
    const acct = await this.brokerage.requireActiveAccount(userId);
    const e = await this.evaluate(userId, dto);
    const bal = await this.ledger.customerBalances(userId, e.inst.currency);
    if (dto.side === 'buy') {
      if (await this.hasRestriction(userId, 'close_only')) e.blockers.push('Your account is restricted to closing positions only');
      if (e.holdMinor > bal.minor.available) e.blockers.push('Insufficient available cash for this order (including price buffer and commission)');
      const bp = await this.brokerage.buyingPower(acct).catch(() => null);
      if (bp && new Decimal(bp.buyingPower).lt(fromMinor(e.holdMinor, e.inst.currency))) {
        e.warnings.push('Partner-reported buying power is lower than this order\'s reserve; the partner may reject it.');
      }
      if (bp && !bp.live) e.warnings.push('Buying power is from the last partner snapshot; the partner is currently unreachable.');
    } else {
      const held = await this.db.one<{ quantity: string }>('SELECT quantity FROM positions WHERE brokerage_account_id = $1 AND instrument_id = $2', [acct.id, e.inst.id]);
      const openSells = await this.db.one<{ q: string | null }>(
        `SELECT sum(quantity - filled_quantity) AS q FROM orders WHERE brokerage_account_id = $1 AND instrument_id = $2 AND side = 'sell'
           AND status IN ('pending_submit','submitted','accepted','partially_filled','pending_cancel')`,
        [acct.id, e.inst.id],
      );
      const sellable = new Decimal(held?.quantity ?? 0).sub(openSells?.q ?? 0);
      if (e.qty.gt(sellable)) e.blockers.push(`You can sell at most ${sellable.toString()} shares (including open sell orders)`);
    }
    const c = e.inst.currency;
    const notionalMinor = roundToMinor(e.notional, c, Decimal.ROUND_HALF_UP);
    const total = dto.side === 'buy' ? notionalMinor + e.fee : notionalMinor - e.fee;
    return {
      symbol: e.inst.symbol,
      name: e.inst.name,
      side: dto.side,
      type: dto.type,
      timeInForce: dto.timeInForce,
      quantity: e.qty.toString(),
      quote: e.quote,
      estimatedPrice: e.estPrice.toFixed(4),
      estimatedNotional: money(notionalMinor, c),
      estimatedCommission: money(e.fee, c),
      estimatedTotal: money(total, c),
      reserveAmount: money(e.holdMinor, c),
      availableCash: money(bal.minor.available, c),
      warnings: e.warnings,
      canSubmit: e.blockers.length === 0,
      blockers: e.blockers,
      disclosure:
        'Orders are routed to and executed by our licensed brokerage partner. Estimates are not guaranteed; the final price, ' +
        'fees and settlement are determined by the partner\'s execution. Investments can fall as well as rise.',
    };
  }

  private async hasRestriction(userId: string, type: string): Promise<boolean> {
    return !!(await this.db.one("SELECT 1 FROM account_restrictions WHERE user_id = $1 AND type = $2 AND lifted_at IS NULL", [userId, type]));
  }

  /** Place an order. Idempotent per (user, Idempotency-Key). */
  async place(userId: string, dto: OrderRequestDto, idempotencyKey: string, req: AppRequest): Promise<OrderRow> {
    const prior = await this.db.one<OrderRow>('SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
    if (prior) return prior;
    const preview = await this.preview(userId, dto);
    if (!preview.canSubmit) {
      throw new AppError('ORDER_VALIDATION_FAILED', preview.blockers[0] ?? 'Order cannot be placed', 422, { blockers: preview.blockers });
    }
    const acct = await this.brokerage.requireActiveAccount(userId);
    const e = await this.evaluate(userId, dto);
    const orderId = randomUUID();
    const order = await this.db.tx(async (c) => {
      // Re-check capability inside the transaction (restrictions may have just been applied).
      await this.eligibility.assertCapability(userId, 'trading', this.cfg.operatingMode, c);
      const ins = await c.query<OrderRow>(
        `INSERT INTO orders (id, user_id, brokerage_account_id, instrument_id, client_order_id, idempotency_key, provider, side, type,
                             time_in_force, quantity, limit_price, stop_price, currency, status, estimated_price, estimated_fee_minor,
                             hold_minor, quote_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending_submit',$15,$16,$17,$18)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
        [
          orderId, userId, acct.id, e.inst.id, `aur-${orderId}`, idempotencyKey, acct.provider, dto.side, dto.type, dto.timeInForce,
          e.qty.toString(), dto.limitPrice ?? null, dto.stopPrice ?? null, e.inst.currency, e.estPrice.toFixed(8), e.fee.toString(),
          e.holdMinor.toString(),
          JSON.stringify({ last: e.quote.last, bid: e.quote.bid, ask: e.quote.ask, asOf: e.quote.asOf, source: e.quote.source, simulated: e.quote.simulated }),
        ],
      );
      const o = ins.rows[0];
      if (!o) return (await c.query<OrderRow>('SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey])).rows[0]!;
      if (dto.side === 'buy' && e.holdMinor > 0n) {
        // Fails with INSUFFICIENT_FUNDS (DB constraint) if concurrent orders already consumed the cash.
        await this.ledger.post(c, {
          idempotencyKey: `order-hold:${o.id}`,
          kind: 'order_hold',
          description: `Reserve for ${dto.side} ${e.qty} ${e.inst.symbol}`,
          referenceType: 'order',
          referenceId: o.id,
          createdBy: { type: 'system' },
          legs: move({ owner: userId, type: 'customer_available', currency: e.inst.currency }, { owner: userId, type: 'customer_held', currency: e.inst.currency }, e.holdMinor),
        });
      }
      await this.event(c, o.id, 'created', null, 'pending_submit', 'customer', { quote: o.quote_snapshot });
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'order.placed', targetType: 'order', targetId: o.id, metadata: { symbol: e.inst.symbol, side: dto.side, qty: dto.quantity, type: dto.type }, req }, c);
      // Durable fallback: if the synchronous submission below is interrupted, the worker resolves it.
      await this.jobs.enqueue(c, 'orders.resolve_submission', { orderId: o.id }, { delaySeconds: 15, dedupeKey: `resolve:${o.id}` });
      return o;
    });
    if (order.status === 'pending_submit') await this.submit(order.id);
    return (await this.get(userId, order.id))!;
  }

  private async event(c: Queryable, orderId: string, type: string, from: string | null, to: string | null, source: string, payload: unknown = {}) {
    await c.query('INSERT INTO order_events (order_id, event_type, from_status, to_status, source, payload) VALUES ($1,$2,$3,$4,$5,$6)', [
      orderId, type, from, to, source, JSON.stringify(payload),
    ]);
  }

  /** Send a pending order to the partner. Safe to call repeatedly (partner is idempotent on client_order_id). */
  async submit(orderId: string): Promise<void> {
    const o = await this.db.one<OrderRow & { symbol: string; provider_account_id: string }>(
      `SELECT o.*, i.symbol, b.provider_account_id FROM orders o JOIN instruments i ON i.id = o.instrument_id
         JOIN brokerage_accounts b ON b.id = o.brokerage_account_id WHERE o.id = $1`,
      [orderId],
    );
    if (!o || o.status !== 'pending_submit') return;
    try {
      const bo = await this.brokerage.adapter.submitOrder(o.provider_account_id, {
        clientOrderId: o.client_order_id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        timeInForce: o.time_in_force,
        quantity: new Decimal(o.quantity).toString(),
        limitPrice: o.limit_price ? new Decimal(o.limit_price).toString() : undefined,
        stopPrice: o.stop_price ? new Decimal(o.stop_price).toString() : undefined,
      });
      await this.applyBrokerOrder(orderId, bo);
    } catch (err) {
      if (err instanceof BrokerError && !err.retryable) {
        await this.finalizeWithoutPartner(orderId, 'rejected', err.message);
        return;
      }
      // Ambiguous: the partner may or may not have the order. Leave pending_submit; resolver will query by client id.
      this.logger.warn(`order ${orderId} submission outcome unknown: ${(err as Error).message}`);
      await this.db.tx(async (c) => {
        await this.event(c, orderId, 'submission_uncertain', 'pending_submit', 'pending_submit', 'system', { error: (err as Error).message });
        await this.jobs.enqueue(c, 'orders.resolve_submission', { orderId }, { delaySeconds: 5, dedupeKey: `resolve:${orderId}` });
      });
    }
  }

  /** Job: resolve an order whose submission outcome is unknown, without ever creating a duplicate. */
  async resolveSubmission(orderId: string, attempt: number): Promise<void> {
    const o = await this.db.one<OrderRow & { provider_account_id: string }>(
      'SELECT o.*, b.provider_account_id FROM orders o JOIN brokerage_accounts b ON b.id = o.brokerage_account_id WHERE o.id = $1',
      [orderId],
    );
    if (!o || !['pending_submit', 'pending_cancel'].includes(o.status) || o.provider_order_id) return;
    const found = await this.brokerage.adapter.findOrderByClientId(o.provider_account_id, o.client_order_id);
    if (found) {
      await this.applyBrokerOrder(orderId, found);
      if (o.status === 'pending_cancel') await this.cancelAtPartner(orderId);
      return;
    }
    if (o.status === 'pending_cancel') {
      await this.finalizeWithoutPartner(orderId, 'canceled', 'Canceled before reaching partner');
      return;
    }
    const ageMs = Date.now() - o.created_at.getTime();
    if (ageMs < 5 * 60_000 && attempt < 6) {
      await this.submit(orderId); // idempotent resubmission
      return;
    }
    await this.finalizeWithoutPartner(orderId, 'failed', 'Order could not be confirmed with the brokerage partner');
  }

  /** Terminal state for orders the partner never accepted: releases the full hold. */
  private async finalizeWithoutPartner(orderId: string, status: 'rejected' | 'failed' | 'canceled', reason: string): Promise<void> {
    await this.db.tx(async (c) => {
      const o = (await c.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
      if (!o || TERMINAL.has(o.status)) return;
      await c.query('UPDATE orders SET status = $2, reject_reason = $3, terminal_at = now(), version = version + 1 WHERE id = $1', [orderId, status, reason]);
      await this.event(c, orderId, status, o.status, status, 'system', { reason });
      await this.releaseHold(c, o);
      await this.notifications.notify(o.user_id, 'order', `Order ${status}`, reason, { orderId }, c);
    });
  }

  private async releaseHold(c: Queryable, o: OrderRow): Promise<void> {
    if (o.side !== 'buy' || BigInt(o.hold_minor) === 0n) return;
    const consumed = BigInt(
      (await c.query<{ s: string }>("SELECT COALESCE(sum(gross_minor + fee_minor), 0)::text AS s FROM executions WHERE order_id = $1", [o.id])).rows[0]!.s,
    );
    const hold = BigInt(o.hold_minor);
    const remaining = hold - (consumed > hold ? hold : consumed);
    if (remaining <= 0n) return;
    await this.ledger.post(c, {
      idempotencyKey: `order-release:${o.id}`,
      kind: 'order_hold_release',
      description: 'Release unused order reserve',
      referenceType: 'order',
      referenceId: o.id,
      createdBy: { type: 'system' },
      legs: move({ owner: o.user_id, type: 'customer_held', currency: o.currency }, { owner: o.user_id, type: 'customer_available', currency: o.currency }, remaining),
    });
  }

  /**
   * Apply the partner's authoritative view of an order: record new executions (deduplicated by
   * provider execution id), post ledger entries, advance status, release unused holds when terminal.
   */
  async applyBrokerOrder(orderId: string, bo: BrokerOrder): Promise<void> {
    let needsResync = false;
    await this.db.tx(async (c) => {
      const o = (await c.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
      if (!o) throw new Error(`order ${orderId} not found`);
      if (bo.clientOrderId !== o.client_order_id) throw new Error(`client order id mismatch for ${orderId}`);
      if (!o.provider_order_id) {
        await c.query('UPDATE orders SET provider_order_id = $2, submitted_at = COALESCE(submitted_at, now()) WHERE id = $1', [orderId, bo.providerOrderId]);
      }
      const schedule = await this.fees.active(o.currency, c);
      for (const ex of bo.executions) {
        await this.recordExecution(c, o, ex, schedule);
      }
      const agg = (
        await c.query<{ q: string; notional: string }>(
          'SELECT COALESCE(sum(quantity), 0)::text AS q, COALESCE(sum(quantity * price), 0)::text AS notional FROM executions WHERE order_id = $1',
          [orderId],
        )
      ).rows[0]!;
      const filled = new Decimal(agg.q);
      const avg = filled.gt(0) ? new Decimal(agg.notional).div(filled).toDecimalPlaces(8).toString() : null;
      let next: OrderStatus = bo.status;
      if (next === 'filled' && filled.lt(o.quantity)) {
        next = 'partially_filled'; // partner reports filled but executions not all visible yet
        needsResync = true;
      }
      if (next === 'accepted' && filled.gt(0)) next = 'partially_filled';
      if (!canTransition(o.status, next)) {
        this.logger.warn(`ignoring out-of-order transition ${o.status} -> ${next} for ${orderId}`);
        next = o.status;
      }
      const terminal = TERMINAL.has(next);
      await c.query(
        `UPDATE orders SET status = $2, filled_quantity = $3, avg_fill_price = $4, reject_reason = COALESCE($5, reject_reason),
                terminal_at = CASE WHEN $6 THEN COALESCE(terminal_at, now()) END, version = version + 1 WHERE id = $1`,
        [orderId, next, filled.toString(), avg, bo.rejectReason ?? null, terminal],
      );
      if (next !== o.status) {
        await this.event(c, orderId, 'status_changed', o.status, next, 'provider', { providerOrderId: bo.providerOrderId, filledQuantity: filled.toString() });
        if (terminal || next === 'partially_filled') {
          const sym = (await c.query<{ symbol: string }>('SELECT symbol FROM instruments WHERE id = $1', [o.instrument_id])).rows[0]!.symbol;
          const title = next === 'filled' ? `Order filled: ${o.side} ${filled} ${sym}` : `Order ${next.replace('_', ' ')}: ${o.side} ${sym}`;
          await this.notifications.notify(o.user_id, 'order', title, avg ? `Average price ${new Decimal(avg).toFixed(2)} ${o.currency}` : bo.rejectReason ?? '', { orderId }, c);
        }
      }
      if (terminal) await this.releaseHold(c, { ...o, status: next });
      await this.jobs.enqueue(c, 'brokerage.sync_account', { brokerageAccountId: o.brokerage_account_id }, { dedupeKey: `sync:${o.brokerage_account_id}` });
    });
    if (needsResync) {
      await this.jobs.enqueue(this.db.pool, 'orders.sync', { orderId }, { delaySeconds: 5, dedupeKey: `order-sync:${orderId}` });
    }
  }

  private async recordExecution(c: PoolClient, o: OrderRow, ex: BrokerOrder['executions'][number], schedule: Awaited<ReturnType<FeeService['active']>>) {
    const qty = new Decimal(ex.quantity);
    const price = new Decimal(ex.price);
    const gross = roundToMinor(qty.mul(price), o.currency, Decimal.ROUND_HALF_EVEN);
    // Commission on cumulative notional minus commission already charged (minimum applies once).
    const prior = (
      await c.query<{ notional: string; fees: string; consumed: string }>(
        `SELECT COALESCE(sum(quantity * price), 0)::text AS notional, COALESCE(sum(fee_minor), 0)::text AS fees,
                COALESCE(sum(gross_minor + fee_minor), 0)::text AS consumed FROM executions WHERE order_id = $1`,
        [o.id],
      )
    ).rows[0]!;
    const already = await c.query('SELECT 1 FROM executions WHERE provider = $1 AND provider_execution_id = $2', [o.provider, ex.providerExecutionId]);
    if (already.rows.length) return;
    let fee = commissionFor(new Decimal(prior.notional).add(qty.mul(price)), schedule) - BigInt(prior.fees);
    if (fee < 0n) fee = 0n;
    if (o.side === 'sell' && fee > gross) fee = gross;
    const ins = await c.query<{ id: string }>(
      `INSERT INTO executions (order_id, provider, provider_execution_id, side, quantity, price, gross_minor, fee_minor, currency, executed_at, settlement_date, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (provider, provider_execution_id) DO NOTHING RETURNING id`,
      [o.id, o.provider, ex.providerExecutionId, ex.side, qty.toString(), price.toString(), gross.toString(), fee.toString(), o.currency, ex.executedAt, ex.settlementDate, JSON.stringify(ex)],
    );
    const execId = ins.rows[0]?.id;
    if (!execId) return;
    const u = o.user_id;
    const ccy = o.currency;
    const A = (type: 'customer_available' | 'customer_held' | 'customer_unsettled' | 'customer_deficit') => ({ owner: u, type, currency: ccy });
    const broker = { type: 'broker_settlement' as const, currency: ccy };
    const revenue = { type: 'platform_fee_revenue' as const, currency: ccy };
    if (o.side === 'buy') {
      const cost = gross + fee;
      // Draw first from THIS order's remaining reserve, then from available cash, then record a deficit.
      const bal = await this.ledger.customerBalances(u, ccy, c);
      let orderHold = BigInt(o.hold_minor) - BigInt(prior.consumed);
      if (orderHold < 0n) orderHold = 0n;
      if (orderHold > bal.minor.held) orderHold = bal.minor.held;
      const fromHold = cost < orderHold ? cost : orderHold;
      let rest = cost - fromHold;
      const fromAvail = rest < bal.minor.available ? rest : bal.minor.available;
      rest -= fromAvail;
      const legs = [dr(A('customer_held'), fromHold), dr(A('customer_available'), fromAvail), dr(A('customer_deficit'), rest), cr(broker, gross), cr(revenue, fee)];
      await this.ledger.post(c, {
        idempotencyKey: `execution:${execId}`, kind: 'trade_buy', description: `Buy ${qty} @ ${price}`,
        referenceType: 'execution', referenceId: execId, createdBy: { type: 'provider', id: o.provider }, legs,
      });
      if (rest > 0n) {
        await c.query(
          `INSERT INTO monitoring_alerts (user_id, rule, severity, details, dedupe_key) VALUES ($1,'customer_deficit','high',$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
          [u, JSON.stringify({ orderId: o.id, executionId: execId, deficitMinor: rest.toString() }), `deficit:${execId}`],
        );
      }
    } else {
      await this.ledger.post(c, {
        idempotencyKey: `execution:${execId}`, kind: 'trade_sell', description: `Sell ${qty} @ ${price}`,
        referenceType: 'execution', referenceId: execId, createdBy: { type: 'provider', id: o.provider },
        legs: [dr(broker, gross), cr(A('customer_unsettled'), gross - fee), cr(revenue, fee)],
      });
    }
    await this.event(c, o.id, 'execution', null, null, 'provider', { executionId: execId, quantity: qty.toString(), price: price.toString(), feeMinor: fee.toString() });
    if (fee > 0n) {
      await c.query(
        "INSERT INTO fee_collections (execution_id, brokerage_account_id, amount_minor, currency, status) VALUES ($1,$2,$3,$4,'pending')",
        [execId, o.brokerage_account_id, fee.toString(), ccy],
      );
      await this.jobs.enqueue(c, 'fees.collect', { executionId: execId });
    }
  }

  /** Job: collect a platform commission from the customer's partner account into the firm account. */
  async collectFee(executionId: string): Promise<void> {
    const f = await this.db.one<{ id: string; amount_minor: bigint; currency: string; status: string; provider_account_id: string }>(
      `SELECT f.id, f.amount_minor, f.currency, f.status, b.provider_account_id FROM fee_collections f
         JOIN brokerage_accounts b ON b.id = f.brokerage_account_id WHERE f.execution_id = $1`,
      [executionId],
    );
    if (!f || f.status === 'collected') return;
    const t = await this.brokerage.adapter.transferCash(f.provider_account_id, 'debit', fromMinor(BigInt(f.amount_minor), f.currency), f.currency, `fee:${executionId}`);
    if (t.status === 'rejected') throw new Error('fee collection rejected by partner');
    await this.db.query("UPDATE fee_collections SET status = 'collected', provider_transfer_id = $2, collected_at = now() WHERE id = $1", [f.id, t.providerTransferId]);
  }

  async cancel(userId: string, orderId: string, req: AppRequest): Promise<OrderRow> {
    const o = await this.get(userId, orderId);
    if (!o) throw new AppError('NOT_FOUND', 'Order not found', 404);
    if (!OPEN.has(o.status) || o.status === 'pending_cancel') {
      throw new AppError('ORDER_NOT_CANCELABLE', `Order is ${o.status} and cannot be canceled`, 409);
    }
    await this.db.tx(async (c) => {
      const locked = (await c.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0]!;
      if (!OPEN.has(locked.status) || locked.status === 'pending_cancel') throw new AppError('ORDER_NOT_CANCELABLE', 'Order can no longer be canceled', 409);
      await c.query("UPDATE orders SET status = 'pending_cancel', version = version + 1 WHERE id = $1", [orderId]);
      await this.event(c, orderId, 'cancel_requested', locked.status, 'pending_cancel', 'customer');
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'order.cancel_requested', targetType: 'order', targetId: orderId, req }, c);
      if (!locked.provider_order_id) {
        await this.jobs.enqueue(c, 'orders.resolve_submission', { orderId }, { dedupeKey: `resolve:${orderId}` });
      }
    });
    if (o.provider_order_id) await this.cancelAtPartner(orderId);
    return (await this.get(userId, orderId))!;
  }

  private async cancelAtPartner(orderId: string): Promise<void> {
    const o = await this.db.one<OrderRow & { provider_account_id: string }>(
      'SELECT o.*, b.provider_account_id FROM orders o JOIN brokerage_accounts b ON b.id = o.brokerage_account_id WHERE o.id = $1',
      [orderId],
    );
    if (!o?.provider_order_id) return;
    try {
      await this.brokerage.adapter.cancelOrder(o.provider_account_id, o.provider_order_id);
    } catch (e) {
      if (!(e instanceof BrokerError) || e.retryable) {
        await this.jobs.enqueue(this.db.pool, 'orders.cancel', { orderId }, { delaySeconds: 5, dedupeKey: `cancel:${orderId}` });
        return;
      }
      // Partner refused (typically already filled): fall through to sync, which restores the true status.
    }
    await this.sync(orderId);
  }

  async retryCancel(orderId: string): Promise<void> {
    const o = await this.db.one<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
    if (o?.status === 'pending_cancel') await this.cancelAtPartner(orderId);
  }

  /** Job/webhook: refresh an order from the partner. */
  async sync(orderId: string): Promise<void> {
    const o = await this.db.one<OrderRow & { provider_account_id: string }>(
      'SELECT o.*, b.provider_account_id FROM orders o JOIN brokerage_accounts b ON b.id = o.brokerage_account_id WHERE o.id = $1',
      [orderId],
    );
    if (!o) return;
    if (!o.provider_order_id) return this.resolveSubmission(orderId, 0);
    const bo = await this.brokerage.adapter.getOrder(o.provider_account_id, o.provider_order_id);
    await this.applyBrokerOrder(orderId, bo);
    // If a cancel was requested but the partner reports it still working, the pending_cancel state stays visible.
  }

  async syncByClientOrderId(clientOrderId: string): Promise<void> {
    const o = await this.db.one<{ id: string }>('SELECT id FROM orders WHERE client_order_id = $1', [clientOrderId]);
    if (o) await this.sync(o.id);
  }

  /** Job: move matured sale proceeds from unsettled to available. */
  async settleExecutions(): Promise<number> {
    const due = await this.db.query<{ id: string; side: string; gross_minor: bigint; fee_minor: bigint; currency: string; user_id: string }>(
      `SELECT e.id, e.side, e.gross_minor, e.fee_minor, e.currency, o.user_id FROM executions e JOIN orders o ON o.id = e.order_id
        WHERE e.settled_at IS NULL AND e.settlement_date <= current_date ORDER BY e.executed_at LIMIT 500`,
    );
    for (const e of due) {
      await this.db.tx(async (c) => {
        const net = BigInt(e.gross_minor) - BigInt(e.fee_minor);
        if (e.side === 'sell' && net > 0n) {
          await this.ledger.post(c, {
            idempotencyKey: `settlement:${e.id}`, kind: 'settlement', description: 'Sale proceeds settled',
            referenceType: 'execution', referenceId: e.id, createdBy: { type: 'system' },
            legs: move({ owner: e.user_id, type: 'customer_unsettled', currency: e.currency }, { owner: e.user_id, type: 'customer_available', currency: e.currency }, net),
          });
        }
        await c.query('UPDATE executions SET settled_at = now() WHERE id = $1 AND settled_at IS NULL', [e.id]);
      });
    }
    return due.length;
  }

  async get(userId: string, orderId: string): Promise<OrderRow | undefined> {
    return this.db.one<OrderRow>('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
  }

  async list(userId: string, opts: { status?: 'open' | 'closed'; limit?: number }) {
    const where = opts.status === 'open' ? `AND o.status = ANY($2)` : opts.status === 'closed' ? `AND NOT (o.status = ANY($2))` : `AND $2::text[] IS NOT NULL`;
    return this.db.query(
      `SELECT o.*, i.symbol, i.name FROM orders o JOIN instruments i ON i.id = o.instrument_id
        WHERE o.user_id = $1 ${where} ORDER BY o.created_at DESC LIMIT $3`,
      [userId, [...OPEN], Math.min(opts.limit ?? 50, 200)],
    );
  }

  async detail(userId: string, orderId: string) {
    const o = await this.db.one<OrderRow & { symbol: string; name: string }>(
      'SELECT o.*, i.symbol, i.name FROM orders o JOIN instruments i ON i.id = o.instrument_id WHERE o.id = $1 AND o.user_id = $2',
      [orderId, userId],
    );
    if (!o) throw new AppError('NOT_FOUND', 'Order not found', 404);
    const [events, executions] = await Promise.all([
      this.db.query('SELECT event_type, from_status, to_status, source, occurred_at FROM order_events WHERE order_id = $1 ORDER BY id', [orderId]),
      this.db.query<{ id: string; quantity: string; price: string; gross_minor: bigint; fee_minor: bigint; executed_at: Date; settlement_date: string; settled_at: Date | null; provider_execution_id: string }>(
        "SELECT id, quantity, price, gross_minor, fee_minor, executed_at, to_char(settlement_date,'YYYY-MM-DD') AS settlement_date, settled_at, provider_execution_id FROM executions WHERE order_id = $1 ORDER BY executed_at",
        [orderId],
      ),
    ]);
    return { order: o, events, executions };
  }
}

export function presentOrder(o: OrderRow & { symbol?: string; name?: string }) {
  return {
    id: o.id,
    clientOrderId: o.client_order_id,
    symbol: o.symbol,
    name: o.name,
    side: o.side,
    type: o.type,
    timeInForce: o.time_in_force,
    quantity: new Decimal(o.quantity).toString(),
    filledQuantity: new Decimal(o.filled_quantity).toString(),
    limitPrice: o.limit_price ? new Decimal(o.limit_price).toString() : null,
    stopPrice: o.stop_price ? new Decimal(o.stop_price).toString() : null,
    avgFillPrice: o.avg_fill_price ? new Decimal(o.avg_fill_price).toFixed(4) : null,
    status: o.status,
    currency: o.currency,
    estimatedPrice: new Decimal(o.estimated_price).toFixed(4),
    estimatedCommission: money(BigInt(o.estimated_fee_minor), o.currency),
    reserved: money(BigInt(o.hold_minor), o.currency),
    rejectReason: o.reject_reason,
    quoteAtSubmission: o.quote_snapshot,
    createdAt: o.created_at,
    submittedAt: o.submitted_at,
    terminalAt: o.terminal_at,
  };
}
