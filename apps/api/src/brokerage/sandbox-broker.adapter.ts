import { Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DbService } from '../database/db.service';
import { Decimal } from '../common/money';
import { sandboxPrice } from '../market-data/sandbox-market-data';
import {
  BrokerAccount, BrokerActivity, BrokerAdapter, BrokerBalances, BrokerDocument, BrokerError, BrokerOrder,
  BrokerOrderRequest, BrokerPosition, BrokerTransfer, NormalizedOrderStatus, OpenAccountRequest,
} from './broker-adapter';
import { settlementDate } from './settlement';

interface SbOrder {
  id: string;
  account_id: string;
  client_order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  quantity: string;
  limit_price: string | null;
  stop_price: string | null;
  status: NormalizedOrderStatus;
  filled_quantity: string;
  avg_fill_price: string | null;
  reject_reason: string | null;
  updated_at: Date;
}

export type BrokerEventSink = (event: { type: 'order_updated'; providerAccountId: string; providerOrderId: string; clientOrderId: string } | { type: 'account_updated'; providerAccountId: string }) => Promise<void>;

/** Orders at or above this quantity are filled in two halves (first now, rest on the next tick). */
export const SANDBOX_PARTIAL_FILL_THRESHOLD = 100;

/**
 * SANDBOX brokerage partner simulation. Behaves like a partner API (idempotent client order ids,
 * asynchronous fills, rejections, outages) so platform code is exercised realistically.
 *
 * Deterministic rules (documented for testers):
 *  - Family name containing "ActionRequired" -> account status action_required; "Reject" -> rejected.
 *  - Market orders fill at the simulated ask/bid; qty >= 100 fills 50% now and the rest on tick().
 *  - Limit/stop orders rest until the simulated price crosses; tick() re-evaluates.
 *  - Insufficient cash or position -> rejected. faults: outage, timeout_next_submit, reject_symbol:<SYM>.
 */
@Injectable()
export class SandboxBrokerAdapter implements BrokerAdapter {
  readonly name = 'sandbox';
  readonly isSandbox = true;
  private readonly logger = new Logger('SandboxPartner');
  private sink: BrokerEventSink | null = null;

  constructor(private readonly db: DbService) {}

  setEventSink(sink: BrokerEventSink): void {
    this.sink = sink;
  }

  private async fault(key: string): Promise<string | undefined> {
    return (await this.db.one<{ value: string }>('SELECT value FROM sandbox_partner.faults WHERE key = $1', [key]))?.value;
  }

  private async checkOutage(): Promise<void> {
    if ((await this.fault('outage')) === 'true') throw new BrokerError('unavailable', 'Sandbox partner outage (fault injected)');
  }

  async setFault(key: string, value: string | null): Promise<void> {
    if (value === null) await this.db.query('DELETE FROM sandbox_partner.faults WHERE key = $1', [key]);
    else await this.db.query('INSERT INTO sandbox_partner.faults (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
  }

  async openAccount(req: OpenAccountRequest): Promise<BrokerAccount> {
    await this.checkOutage();
    const existing = await this.db.one<{ id: string }>("SELECT id FROM sandbox_partner.accounts WHERE applicant->>'platformUserId' = $1", [req.platformUserId]);
    if (existing) return this.getAccount(existing.id);
    const status = /reject/i.test(req.familyName) ? 'rejected' : /actionrequired/i.test(req.familyName) ? 'action_required' : 'active';
    const id = `sbx-acct-${randomUUID()}`;
    const number = `SBX${randomInt(100_000_000, 1_000_000_000)}`;
    const { taxId: _omit, ...applicant } = req;
    await this.db.query(
      'INSERT INTO sandbox_partner.accounts (id, account_number, status, currency, applicant) VALUES ($1,$2,$3,$4,$5)',
      [id, number, status, req.currency, JSON.stringify(applicant)],
    );
    return { providerAccountId: id, accountNumber: number, status, currency: req.currency };
  }

  async getAccount(id: string): Promise<BrokerAccount> {
    await this.checkOutage();
    const a = await this.db.one<{ id: string; account_number: string; status: BrokerAccount['status']; currency: string }>(
      'SELECT id, account_number, status, currency FROM sandbox_partner.accounts WHERE id = $1',
      [id],
    );
    if (!a) throw new BrokerError('not_found', 'Account not found');
    return { providerAccountId: a.id, accountNumber: a.account_number, status: a.status, currency: a.currency };
  }

  async getBalances(id: string): Promise<BrokerBalances> {
    await this.checkOutage();
    const a = await this.db.one<{ cash: string; currency: string }>('SELECT cash, currency FROM sandbox_partner.accounts WHERE id = $1', [id]);
    if (!a) throw new BrokerError('not_found', 'Account not found');
    const positions = await this.getPositions(id);
    const now = Date.now();
    const mv = positions.reduce((s, p) => s.add(new Decimal(p.quantity).mul(sandboxPrice(p.symbol, now))), new Decimal(0));
    const reserved = await this.openBuyReservation(this.db.pool as unknown as PoolClient, id);
    const cash = new Decimal(a.cash);
    return {
      cash: cash.toFixed(4),
      buyingPower: Decimal.max(0, cash.sub(reserved)).toFixed(4),
      equity: cash.add(mv).toFixed(4),
      currency: a.currency,
      asOf: new Date(now).toISOString(),
      raw: { simulated: true },
    };
  }

  async getPositions(id: string): Promise<BrokerPosition[]> {
    await this.checkOutage();
    const rows = await this.db.query<{ symbol: string; quantity: string; avg_price: string }>(
      'SELECT symbol, quantity, avg_price FROM sandbox_partner.positions WHERE account_id = $1 AND quantity > 0 ORDER BY symbol',
      [id],
    );
    return rows.map((r) => ({
      symbol: r.symbol,
      quantity: new Decimal(r.quantity).toString(),
      avgEntryPrice: new Decimal(r.avg_price).toFixed(4),
      costBasis: new Decimal(r.quantity).mul(r.avg_price).toFixed(4),
    }));
  }

  private async openBuyReservation(c: Pick<PoolClient, 'query'>, accountId: string): Promise<Decimal> {
    const open = (
      await c.query<{ symbol: string; quantity: string; filled_quantity: string; limit_price: string | null }>(
        `SELECT symbol, quantity, filled_quantity, limit_price FROM sandbox_partner.orders
          WHERE account_id = $1 AND side = 'buy' AND status IN ('accepted','partially_filled')`,
        [accountId],
      )
    ).rows;
    const now = Date.now();
    return open.reduce(
      (s, o) => s.add(new Decimal(o.quantity).sub(o.filled_quantity).mul(o.limit_price ?? sandboxPrice(o.symbol, now) * 1.02)),
      new Decimal(0),
    );
  }

  async submitOrder(accountId: string, req: BrokerOrderRequest): Promise<BrokerOrder> {
    await this.checkOutage();
    const existing = await this.db.one<{ id: string }>('SELECT id FROM sandbox_partner.orders WHERE client_order_id = $1', [req.clientOrderId]);
    if (existing) return this.getOrder(accountId, existing.id);

    const id = `sbx-ord-${randomUUID()}`;
    await this.db.tx(async (c) => {
      const acct = (await c.query<{ cash: string; status: string }>('SELECT cash, status FROM sandbox_partner.accounts WHERE id = $1 FOR UPDATE', [accountId])).rows[0];
      if (!acct) throw new BrokerError('not_found', 'Account not found');
      let status: NormalizedOrderStatus = 'accepted';
      let reject: string | null = null;
      const qty = new Decimal(req.quantity);
      const price = sandboxPrice(req.symbol, Date.now());
      if (acct.status !== 'active') {
        status = 'rejected';
        reject = 'account not active';
      } else if ((await this.fault(`reject_symbol:${req.symbol}`)) === 'true') {
        status = 'rejected';
        reject = 'symbol not tradable (fault injected)';
      } else if (req.side === 'buy') {
        const reserved = await this.openBuyReservation(c, accountId);
        const cost = qty.mul(req.limitPrice ?? price * 1.02);
        if (cost.gt(new Decimal(acct.cash).sub(reserved))) {
          status = 'rejected';
          reject = 'insufficient buying power';
        }
      } else {
        const pos = (await c.query<{ quantity: string }>('SELECT quantity FROM sandbox_partner.positions WHERE account_id = $1 AND symbol = $2', [accountId, req.symbol])).rows[0];
        const openSells = (
          await c.query<{ q: string | null }>(
            `SELECT sum(quantity - filled_quantity) AS q FROM sandbox_partner.orders
              WHERE account_id = $1 AND symbol = $2 AND side = 'sell' AND status IN ('accepted','partially_filled')`,
            [accountId, req.symbol],
          )
        ).rows[0]?.q;
        if (!pos || qty.gt(new Decimal(pos.quantity).sub(openSells ?? 0))) {
          status = 'rejected';
          reject = 'insufficient position';
        }
      }
      await c.query(
        `INSERT INTO sandbox_partner.orders (id, account_id, client_order_id, symbol, side, type, time_in_force, quantity, limit_price, stop_price, status, reject_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, accountId, req.clientOrderId, req.symbol, req.side, req.type, req.timeInForce, req.quantity, req.limitPrice ?? null, req.stopPrice ?? null, status, reject],
      );
      if (status === 'accepted') await this.match(c, id, true);
    });
    if ((await this.fault('timeout_next_submit')) === 'true') {
      await this.setFault('timeout_next_submit', null);
      // The order WAS created at the partner, but the caller never sees the response.
      throw new BrokerError('transient', 'Sandbox partner timed out after accepting the request (fault injected)');
    }
    const order = await this.getOrder(accountId, id);
    await this.emit(accountId, order);
    return order;
  }

  /** Attempt to (partially) fill an open order at the current simulated price. */
  private async match(c: Pick<PoolClient, 'query'>, orderId: string, initial: boolean): Promise<boolean> {
    const o = (await c.query<SbOrder>('SELECT * FROM sandbox_partner.orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
    if (!o || !['accepted', 'partially_filled'].includes(o.status)) return false;
    const mid = sandboxPrice(o.symbol, Date.now());
    const px = new Decimal(o.side === 'buy' ? mid * 1.0001 : mid * 0.9999).toDecimalPlaces(4);
    const lim = o.limit_price ? new Decimal(o.limit_price) : null;
    const stop = o.stop_price ? new Decimal(o.stop_price) : null;
    const stopTriggered = !stop || (o.side === 'buy' ? px.gte(stop) : px.lte(stop));
    const limitOk = !lim || (o.side === 'buy' ? px.lte(lim) : px.gte(lim));
    const marketable = stopTriggered && limitOk;
    const remaining = new Decimal(o.quantity).sub(o.filled_quantity);

    if (!marketable) {
      if (o.time_in_force === 'ioc' || o.time_in_force === 'fok') {
        await c.query("UPDATE sandbox_partner.orders SET status = 'canceled', updated_at = now() WHERE id = $1", [o.id]);
        return true;
      }
      return false;
    }
    let fillQty = remaining;
    if (initial && new Decimal(o.quantity).gte(SANDBOX_PARTIAL_FILL_THRESHOLD) && o.time_in_force !== 'fok') {
      fillQty = new Decimal(o.quantity).div(2).floor();
    }
    const fillId = `sbx-fill-${randomUUID()}`;
    const now = new Date();
    await c.query('INSERT INTO sandbox_partner.fills (id, order_id, quantity, price, executed_at, settlement_date) VALUES ($1,$2,$3,$4,$5,$6)', [
      fillId, o.id, fillQty.toString(), px.toString(), now, settlementDate(now),
    ]);
    const newFilled = new Decimal(o.filled_quantity).add(fillQty);
    const prevNotional = new Decimal(o.avg_fill_price ?? 0).mul(o.filled_quantity);
    const avg = prevNotional.add(fillQty.mul(px)).div(newFilled);
    let status: NormalizedOrderStatus = newFilled.eq(o.quantity) ? 'filled' : 'partially_filled';
    if (status === 'partially_filled' && o.time_in_force === 'ioc') status = 'canceled';
    await c.query('UPDATE sandbox_partner.orders SET filled_quantity = $2, avg_fill_price = $3, status = $4, updated_at = now() WHERE id = $1', [
      o.id, newFilled.toString(), avg.toDecimalPlaces(8).toString(), status,
    ]);
    const notional = fillQty.mul(px);
    if (o.side === 'buy') {
      await c.query('UPDATE sandbox_partner.accounts SET cash = cash - $2 WHERE id = $1', [o.account_id, notional.toFixed(4)]);
      await c.query(
        `INSERT INTO sandbox_partner.positions (account_id, symbol, quantity, avg_price) VALUES ($1,$2,$3,$4)
         ON CONFLICT (account_id, symbol) DO UPDATE
           SET avg_price = (positions.quantity * positions.avg_price + EXCLUDED.quantity * EXCLUDED.avg_price) / (positions.quantity + EXCLUDED.quantity),
               quantity = positions.quantity + EXCLUDED.quantity`,
        [o.account_id, o.symbol, fillQty.toString(), px.toString()],
      );
    } else {
      await c.query('UPDATE sandbox_partner.accounts SET cash = cash + $2 WHERE id = $1', [o.account_id, notional.toFixed(4)]);
      await c.query('UPDATE sandbox_partner.positions SET quantity = quantity - $3 WHERE account_id = $1 AND symbol = $2', [o.account_id, o.symbol, fillQty.toString()]);
    }
    return true;
  }

  /** Advance the simulation: re-evaluate resting orders. Driven by a worker job or tests. */
  async tick(): Promise<number> {
    const open = await this.db.query<{ id: string; account_id: string }>(
      "SELECT id, account_id FROM sandbox_partner.orders WHERE status IN ('accepted','partially_filled') ORDER BY created_at",
    );
    let changed = 0;
    for (const o of open) {
      const did = await this.db.tx((c) => this.match(c, o.id, false));
      if (did) {
        changed++;
        await this.emit(o.account_id, await this.getOrder(o.account_id, o.id));
      }
    }
    return changed;
  }

  async findOrderByClientId(accountId: string, clientOrderId: string): Promise<BrokerOrder | null> {
    await this.checkOutage();
    const o = await this.db.one<{ id: string }>('SELECT id FROM sandbox_partner.orders WHERE client_order_id = $1 AND account_id = $2', [clientOrderId, accountId]);
    return o ? this.getOrder(accountId, o.id) : null;
  }

  async getOrder(accountId: string, orderId: string): Promise<BrokerOrder> {
    await this.checkOutage();
    const o = await this.db.one<SbOrder>('SELECT * FROM sandbox_partner.orders WHERE id = $1 AND account_id = $2', [orderId, accountId]);
    if (!o) throw new BrokerError('not_found', 'Order not found');
    const fills = await this.db.query<{ id: string; quantity: string; price: string; executed_at: Date; settlement_date: Date | string }>(
      "SELECT id, quantity, price, executed_at, to_char(settlement_date, 'YYYY-MM-DD') AS settlement_date FROM sandbox_partner.fills WHERE order_id = $1 ORDER BY executed_at, id",
      [o.id],
    );
    return {
      providerOrderId: o.id,
      clientOrderId: o.client_order_id,
      status: o.status,
      filledQuantity: new Decimal(o.filled_quantity).toString(),
      avgFillPrice: o.avg_fill_price ? new Decimal(o.avg_fill_price).toString() : null,
      rejectReason: o.reject_reason,
      updatedAt: o.updated_at.toISOString(),
      executions: fills.map((f) => ({
        providerExecutionId: f.id,
        providerOrderId: o.id,
        side: o.side,
        quantity: new Decimal(f.quantity).toString(),
        price: new Decimal(f.price).toString(),
        executedAt: f.executed_at.toISOString(),
        settlementDate: String(f.settlement_date),
      })),
    };
  }

  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    await this.checkOutage();
    const r = await this.db.query(
      "UPDATE sandbox_partner.orders SET status = 'canceled', updated_at = now() WHERE id = $1 AND account_id = $2 AND status IN ('accepted','partially_filled') RETURNING id",
      [orderId, accountId],
    );
    if (!r.length) {
      const o = await this.getOrder(accountId, orderId);
      throw new BrokerError('rejected', `Order cannot be canceled in status ${o.status}`);
    }
    await this.emit(accountId, await this.getOrder(accountId, orderId));
  }

  async listActivities(accountId: string, since: Date): Promise<BrokerActivity[]> {
    await this.checkOutage();
    const rows = await this.db.query<{ id: string; type: BrokerActivity['type']; amount: string; symbol: string | null; description: string; occurred_at: Date }>(
      'SELECT * FROM sandbox_partner.activities WHERE account_id = $1 AND occurred_at >= $2 ORDER BY occurred_at',
      [accountId, since],
    );
    return rows.map((r) => ({
      providerActivityId: r.id, type: r.type, amount: new Decimal(r.amount).toFixed(4), symbol: r.symbol,
      description: r.description, occurredAt: r.occurred_at.toISOString(),
    }));
  }

  /** Test helper: the simulated partner pays a dividend into the account. */
  async simulateDividend(accountId: string, symbol: string, perShare: string): Promise<string | null> {
    const pos = await this.db.one<{ quantity: string }>('SELECT quantity FROM sandbox_partner.positions WHERE account_id = $1 AND symbol = $2 AND quantity > 0', [accountId, symbol]);
    if (!pos) return null;
    const amount = new Decimal(pos.quantity).mul(perShare).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    if (amount.lte(0)) return null;
    const id = `sbx-act-${randomUUID()}`;
    await this.db.tx(async (c) => {
      await c.query('INSERT INTO sandbox_partner.activities (id, account_id, type, amount, symbol, description) VALUES ($1,$2,$3,$4,$5,$6)', [
        id, accountId, 'dividend', amount.toFixed(4), symbol, `Cash dividend ${symbol} @ ${perShare}/sh (simulated)`,
      ]);
      await c.query('UPDATE sandbox_partner.accounts SET cash = cash + $2 WHERE id = $1', [accountId, amount.toFixed(4)]);
    });
    return id;
  }

  async listDocuments(accountId: string): Promise<BrokerDocument[]> {
    await this.checkOutage();
    const a = await this.db.one<{ created_at: Date }>('SELECT created_at FROM sandbox_partner.accounts WHERE id = $1', [accountId]);
    if (!a) throw new BrokerError('not_found', 'Account not found');
    const docs: BrokerDocument[] = [];
    const d = new Date(Date.UTC(a.created_at.getUTCFullYear(), a.created_at.getUTCMonth(), 1));
    const now = new Date();
    while (d < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) {
      const start = d.toISOString().slice(0, 10);
      const endD = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      docs.push({
        providerDocumentId: `sbx-stmt-${accountId}-${start.slice(0, 7)}`,
        kind: 'account_statement',
        title: `Monthly statement ${start.slice(0, 7)} (SANDBOX)`,
        periodStart: start,
        periodEnd: endD.toISOString().slice(0, 10),
      });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return docs;
  }

  async transferCash(accountId: string, direction: 'credit' | 'debit', amount: string, _currency: string, reference: string): Promise<BrokerTransfer> {
    await this.checkOutage();
    const prior = await this.db.one<{ id: string }>('SELECT id FROM sandbox_partner.transfers WHERE reference = $1', [reference]);
    if (prior) return { providerTransferId: prior.id, status: 'completed' };
    const id = `sbx-xfer-${randomUUID()}`;
    await this.db.tx(async (c) => {
      const acct = (await c.query<{ cash: string }>('SELECT cash FROM sandbox_partner.accounts WHERE id = $1 FOR UPDATE', [accountId])).rows[0];
      if (!acct) throw new BrokerError('not_found', 'Account not found');
      if (direction === 'debit' && new Decimal(acct.cash).lt(amount)) throw new BrokerError('rejected', 'Insufficient cash at partner');
      await c.query('INSERT INTO sandbox_partner.transfers (id, account_id, direction, amount, reference) VALUES ($1,$2,$3,$4,$5)', [id, accountId, direction, amount, reference]);
      await c.query(`UPDATE sandbox_partner.accounts SET cash = cash ${direction === 'credit' ? '+' : '-'} $2 WHERE id = $1`, [accountId, amount]);
    });
    return { providerTransferId: id, status: 'completed' };
  }

  private async emit(accountId: string, o: BrokerOrder): Promise<void> {
    if (!this.sink) return;
    try {
      await this.sink({ type: 'order_updated', providerAccountId: accountId, providerOrderId: o.providerOrderId, clientOrderId: o.clientOrderId });
    } catch (e) {
      this.logger.warn(`event sink failed: ${(e as Error).message}`);
    }
  }
}
