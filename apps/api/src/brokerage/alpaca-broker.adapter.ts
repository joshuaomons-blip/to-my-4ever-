import { Logger } from '@nestjs/common';
import { Decimal } from '../common/money';
import {
  BrokerAccount, BrokerAccountStatus, BrokerActivity, BrokerAdapter, BrokerBalances, BrokerDocument, BrokerError,
  BrokerExecution, BrokerOrder, BrokerOrderRequest, BrokerPosition, BrokerTransfer, NormalizedOrderStatus, OpenAccountRequest,
} from './broker-adapter';
import { settlementDate } from './settlement';

/**
 * Alpaca Broker API adapter (https://docs.alpaca.markets/docs/about-broker-api).
 *
 * Evidence status (see docs/integrations/brokerage-providers.md):
 *  - CONFIRMED from Alpaca docs: sandbox base URL broker-api.sandbox.alpaca.markets,
 *    POST /v1/trading/accounts/{account_id}/orders, SSE streams /v1/events/{accounts/status,trades,journals/status,transfers/status}.
 *  - TO VERIFY against the current API reference before integration testing: account-opening payload
 *    fields, activities filtering, documents listing, journal entry types and the firm account set-up.
 * Alpaca delivers events via Server-Sent Events rather than signed webhooks; an SSE consumer should
 * call OrderSyncService.syncByProviderOrder() for each trade event and persist the last event id.
 *
 * Do not enable in production without a signed Broker API agreement and Alpaca's review of the
 * operating model (fully-disclosed vs omnibus, supported customer countries).
 */
export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly name = 'alpaca';
  readonly isSandbox: boolean;
  private readonly logger = new Logger('AlpacaBroker');
  private readonly auth: string;

  constructor(
    private readonly opts: { baseUrl: string; apiKey: string; apiSecret: string; firmAccountId?: string; timeoutMs?: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.isSandbox = opts.baseUrl.includes('sandbox');
    this.auth = 'Basic ' + Buffer.from(`${opts.apiKey}:${opts.apiSecret}`).toString('base64');
  }

  private async call<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 10_000);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        method,
        headers: { Authorization: this.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      // Network error/timeout: outcome unknown for writes. Only GETs are retried here.
      if (method === 'GET' && attempt < 2) return this.call(method, path, body, attempt + 1);
      throw new BrokerError('transient', `Alpaca request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 || res.status >= 500) {
      if (method === 'GET' && attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        return this.call(method, path, body, attempt + 1);
      }
      throw new BrokerError(res.status === 429 ? 'transient' : 'unavailable', `Alpaca HTTP ${res.status}`);
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const msg = (json as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
      const kind = res.status === 401 || res.status === 403 ? 'auth' : res.status === 404 ? 'not_found' : res.status === 422 || res.status === 400 ? 'rejected' : 'invalid';
      throw new BrokerError(kind, `Alpaca: ${msg}`, String(res.status));
    }
    return json as T;
  }

  private static accountStatus(s: string): BrokerAccountStatus {
    switch (s) {
      case 'ACTIVE': return 'active';
      case 'ACTION_REQUIRED': case 'APPROVAL_PENDING': case 'SUBMISSION_FAILED': return 'action_required';
      case 'REJECTED': return 'rejected';
      case 'ACCOUNT_CLOSED': return 'closed';
      case 'DISABLED': case 'ACCOUNT_UPDATED': return 'restricted';
      default: return 'submitted';
    }
  }

  private static orderStatus(s: string): NormalizedOrderStatus {
    switch (s) {
      case 'filled': return 'filled';
      case 'partially_filled': return 'partially_filled';
      case 'canceled': case 'done_for_day': return 'canceled';
      case 'expired': return 'expired';
      case 'rejected': return 'rejected';
      case 'pending_cancel': return 'pending_cancel';
      default: return 'accepted'; // new, accepted, pending_new, held, calculated, replaced...
    }
  }

  async openAccount(r: OpenAccountRequest): Promise<BrokerAccount> {
    const a = await this.call<{ id: string; account_number: string; status: string; currency: string }>('POST', '/v1/accounts', {
      contact: {
        email_address: r.email,
        phone_number: r.phone,
        street_address: [r.address.line1, r.address.line2].filter(Boolean),
        city: r.address.city,
        state: r.address.region ?? undefined,
        postal_code: r.address.postalCode,
      },
      identity: {
        given_name: r.givenName,
        family_name: r.familyName,
        date_of_birth: r.dateOfBirth,
        tax_id: r.taxId,
        country_of_citizenship: r.citizenship,
        country_of_tax_residence: r.taxCountry,
        funding_source: [r.fundingSource],
      },
      disclosures: {
        is_control_person: r.disclosures.isControlPerson,
        is_affiliated_exchange_or_finra: r.disclosures.isAffiliatedExchange,
        is_politically_exposed: r.disclosures.isPoliticallyExposed,
        immediate_family_exposed: false,
      },
      agreements: ['customer_agreement', 'account_agreement'].map((agreement) => ({
        agreement, signed_at: r.agreementsSignedAt, ip_address: r.ipAddress,
      })),
    });
    return { providerAccountId: a.id, accountNumber: a.account_number ?? null, status: AlpacaBrokerAdapter.accountStatus(a.status), currency: a.currency ?? 'USD' };
  }

  async getAccount(id: string): Promise<BrokerAccount> {
    const a = await this.call<{ id: string; account_number: string; status: string; currency: string }>('GET', `/v1/accounts/${encodeURIComponent(id)}`);
    return { providerAccountId: a.id, accountNumber: a.account_number ?? null, status: AlpacaBrokerAdapter.accountStatus(a.status), currency: a.currency ?? 'USD' };
  }

  async getBalances(id: string): Promise<BrokerBalances> {
    const t = await this.call<{ cash: string; buying_power: string; equity: string; currency?: string }>('GET', `/v1/trading/accounts/${encodeURIComponent(id)}/account`);
    return { cash: t.cash, buyingPower: t.buying_power, equity: t.equity, currency: t.currency ?? 'USD', asOf: new Date().toISOString(), raw: t };
  }

  async getPositions(id: string): Promise<BrokerPosition[]> {
    const ps = await this.call<Array<{ symbol: string; qty: string; avg_entry_price: string; cost_basis: string }>>('GET', `/v1/trading/accounts/${encodeURIComponent(id)}/positions`);
    return ps.map((p) => ({ symbol: p.symbol, quantity: p.qty, avgEntryPrice: p.avg_entry_price, costBasis: p.cost_basis }));
  }

  private async toOrder(accountId: string, o: AlpacaOrder): Promise<BrokerOrder> {
    let executions: BrokerExecution[] = [];
    if (new Decimal(o.filled_qty ?? 0).gt(0)) {
      const fills = await this.call<AlpacaFill[]>('GET', `/v1/accounts/activities/FILL?account_id=${encodeURIComponent(accountId)}&after=${encodeURIComponent(o.created_at)}`);
      executions = fills.filter((f) => f.order_id === o.id).map((f) => ({
        providerExecutionId: f.id,
        providerOrderId: o.id,
        side: f.side === 'sell' ? 'sell' : 'buy',
        quantity: f.qty,
        price: f.price,
        executedAt: f.transaction_time,
        settlementDate: settlementDate(new Date(f.transaction_time)),
      }));
    }
    return {
      providerOrderId: o.id,
      clientOrderId: o.client_order_id,
      status: AlpacaBrokerAdapter.orderStatus(o.status),
      filledQuantity: o.filled_qty ?? '0',
      avgFillPrice: o.filled_avg_price ?? null,
      rejectReason: o.status === 'rejected' ? 'rejected by partner' : null,
      executions,
      updatedAt: o.updated_at,
    };
  }

  async submitOrder(accountId: string, r: BrokerOrderRequest): Promise<BrokerOrder> {
    const o = await this.call<AlpacaOrder>('POST', `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders`, {
      symbol: r.symbol,
      qty: r.quantity,
      side: r.side,
      type: r.type,
      time_in_force: r.timeInForce,
      limit_price: r.limitPrice,
      stop_price: r.stopPrice,
      client_order_id: r.clientOrderId,
    });
    return this.toOrder(accountId, o);
  }

  async findOrderByClientId(accountId: string, clientOrderId: string): Promise<BrokerOrder | null> {
    const list = await this.call<AlpacaOrder[]>('GET', `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders?status=all&limit=500`);
    const o = list.find((x) => x.client_order_id === clientOrderId);
    return o ? this.toOrder(accountId, o) : null;
  }

  async getOrder(accountId: string, orderId: string): Promise<BrokerOrder> {
    const o = await this.call<AlpacaOrder>('GET', `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`);
    return this.toOrder(accountId, o);
  }

  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    await this.call('DELETE', `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`);
  }

  async listActivities(accountId: string, since: Date): Promise<BrokerActivity[]> {
    const rows = await this.call<Array<{ id: string; activity_type: string; net_amount: string; symbol?: string; description?: string; date?: string; created_at?: string }>>(
      'GET',
      `/v1/accounts/activities?account_id=${encodeURIComponent(accountId)}&activity_types=DIV,DIVNRA,INT,FEE,JNLC&after=${encodeURIComponent(since.toISOString())}`,
    );
    const map: Record<string, BrokerActivity['type']> = { DIV: 'dividend', DIVNRA: 'dividend_tax_withheld', INT: 'interest', FEE: 'fee', JNLC: 'journal' };
    return rows.map((a) => ({
      providerActivityId: a.id,
      type: map[a.activity_type] ?? 'other',
      amount: a.net_amount,
      symbol: a.symbol ?? null,
      description: a.description ?? a.activity_type,
      occurredAt: a.created_at ?? a.date ?? new Date().toISOString(),
    }));
  }

  async listDocuments(accountId: string): Promise<BrokerDocument[]> {
    const docs = await this.call<Array<{ id: string; type: string; name?: string; date?: string }>>('GET', `/v1/accounts/${encodeURIComponent(accountId)}/documents`);
    return docs.map((d) => ({
      providerDocumentId: d.id,
      kind: d.type === 'trade_confirmation' ? 'trade_confirmation' : d.type === 'account_statement' ? 'account_statement' : d.type?.startsWith('tax') ? 'tax_form' : 'other',
      title: d.name ?? d.type,
      periodStart: d.date ?? null,
      periodEnd: d.date ?? null,
    }));
  }

  async transferCash(accountId: string, direction: 'credit' | 'debit', amount: string, _currency: string, reference: string): Promise<BrokerTransfer> {
    if (!this.opts.firmAccountId) throw new BrokerError('invalid', 'ALPACA_FIRM_ACCOUNT_ID is required for journals');
    const [from, to] = direction === 'credit' ? [this.opts.firmAccountId, accountId] : [accountId, this.opts.firmAccountId];
    const j = await this.call<{ id: string; status: string }>('POST', '/v1/journals', {
      from_account: from, to_account: to, entry_type: 'JNLC', amount, description: reference,
    });
    return { providerTransferId: j.id, status: j.status === 'executed' ? 'completed' : j.status === 'rejected' ? 'rejected' : 'pending' };
  }
}

interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
  created_at: string;
  updated_at: string;
}

interface AlpacaFill {
  id: string;
  order_id: string;
  side: string;
  qty: string;
  price: string;
  transaction_time: string;
}
