/**
 * Provider-neutral contract for a LICENSED brokerage partner (broker-dealer / investment firm /
 * custodian). The platform never executes trades itself: every order is routed to the partner and
 * every execution, position and balance shown to customers originates from the partner.
 *
 * Implementations:
 *  - SandboxBrokerAdapter: in-repo simulation for development/testing. NOT a real broker.
 *  - AlpacaBrokerAdapter: Alpaca Broker API (sandbox base URL by default). Requires a signed
 *    Broker API agreement for production use.
 */
export type NormalizedOrderStatus =
  | 'accepted'
  | 'partially_filled'
  | 'filled'
  | 'pending_cancel'
  | 'canceled'
  | 'rejected'
  | 'expired';

export type BrokerAccountStatus = 'submitted' | 'action_required' | 'active' | 'restricted' | 'rejected' | 'closed';

export interface OpenAccountRequest {
  platformUserId: string;
  email: string;
  phone: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string; // YYYY-MM-DD
  taxId?: string;
  taxCountry: string;
  citizenship: string;
  address: { line1: string; line2?: string | null; city: string; region?: string | null; postalCode: string; country: string };
  fundingSource: string;
  disclosures: { isControlPerson: boolean; isAffiliatedExchange: boolean; isPoliticallyExposed: boolean };
  agreementsSignedAt: string;
  ipAddress: string;
  currency: string;
}

export interface BrokerAccount {
  providerAccountId: string;
  accountNumber: string | null;
  status: BrokerAccountStatus;
  currency: string;
}

export interface BrokerBalances {
  cash: string;
  buyingPower: string;
  equity: string;
  currency: string;
  asOf: string;
  raw?: unknown;
}

export interface BrokerPosition {
  symbol: string;
  quantity: string;
  avgEntryPrice: string;
  costBasis: string;
}

export interface BrokerOrderRequest {
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  quantity: string;
  limitPrice?: string;
  stopPrice?: string;
}

export interface BrokerExecution {
  providerExecutionId: string;
  providerOrderId: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  executedAt: string;
  settlementDate: string; // YYYY-MM-DD
}

export interface BrokerOrder {
  providerOrderId: string;
  clientOrderId: string;
  status: NormalizedOrderStatus;
  filledQuantity: string;
  avgFillPrice: string | null;
  rejectReason?: string | null;
  executions: BrokerExecution[];
  updatedAt: string;
}

export interface BrokerActivity {
  providerActivityId: string;
  type: 'dividend' | 'dividend_tax_withheld' | 'interest' | 'fee' | 'corporate_action' | 'journal' | 'other';
  amount: string; // signed, account currency
  symbol?: string | null;
  description: string;
  occurredAt: string;
}

export interface BrokerDocument {
  providerDocumentId: string;
  kind: 'trade_confirmation' | 'account_statement' | 'tax_form' | 'other';
  title: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface BrokerTransfer {
  providerTransferId: string;
  status: 'pending' | 'completed' | 'rejected';
}

/** Error categories drive retry behaviour. */
export class BrokerError extends Error {
  constructor(
    readonly kind: 'transient' | 'unavailable' | 'rejected' | 'not_found' | 'auth' | 'invalid',
    message: string,
    readonly providerCode?: string,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.kind === 'transient' || this.kind === 'unavailable';
  }
}

export interface BrokerAdapter {
  readonly name: string;
  readonly isSandbox: boolean;
  openAccount(req: OpenAccountRequest): Promise<BrokerAccount>;
  getAccount(providerAccountId: string): Promise<BrokerAccount>;
  getBalances(providerAccountId: string): Promise<BrokerBalances>;
  getPositions(providerAccountId: string): Promise<BrokerPosition[]>;
  /** MUST be idempotent on clientOrderId (resubmitting the same id never creates a second order). */
  submitOrder(providerAccountId: string, order: BrokerOrderRequest): Promise<BrokerOrder>;
  /** Used to resolve ambiguous submissions (timeouts) without risking a duplicate order. */
  findOrderByClientId(providerAccountId: string, clientOrderId: string): Promise<BrokerOrder | null>;
  getOrder(providerAccountId: string, providerOrderId: string): Promise<BrokerOrder>;
  cancelOrder(providerAccountId: string, providerOrderId: string): Promise<void>;
  listActivities(providerAccountId: string, since: Date): Promise<BrokerActivity[]>;
  listDocuments(providerAccountId: string): Promise<BrokerDocument[]>;
  /** Move cash between the platform's partner-held firm account and the customer account. Idempotent on reference. */
  transferCash(providerAccountId: string, direction: 'credit' | 'debit', amount: string, currency: string, reference: string): Promise<BrokerTransfer>;
}

export const BROKER_ADAPTER = Symbol('BROKER_ADAPTER');
