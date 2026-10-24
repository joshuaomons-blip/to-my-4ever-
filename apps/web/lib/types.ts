export interface Money { amount: string; currency: string }
export interface User { id: string; email: string; displayName: string; emailVerified: boolean; mfaEnabled: boolean; residenceCountry: string | null; baseCurrency: string; status: string }
export interface Session { user: User; mfaVerified: boolean; operatingMode: 'sandbox' | 'live' }
export interface Quote { symbol: string; bid: string; ask: string; last: string; previousClose: string; currency: string; asOf: string; source: string; delayed: boolean; simulated: boolean; ageSeconds: number; stale: boolean }
export interface Cash { currency: string; available: string; pending: string; held: string; unsettled: string; withdrawalHold: string; deficit: string; total: string }
export interface Holding { symbol: string; name: string; assetClass: string; sector: string | null; quantity: string; avgEntryPrice: string; lastPrice: string; marketValue: string; costBasis: string; unrealizedPl: string; unrealizedPlPct: string; priceAsOf: string | null; priceStale: boolean }
export interface Portfolio {
  operatingMode: string; dataNotice?: string | null;
  account: { status: string; accountNumber?: string; provider?: string; lastSyncedAt?: string } | null;
  cash: Cash;
  buyingPower: { amount: string; currency: string; asOf: string; live: boolean; source: string } | null;
  totals: { currency: string; marketValue: string; costBasis: string; unrealizedPl: string; dayChange: string; estimatedPortfolioValue: string; note: string } | null;
  holdings: Holding[];
  allocation?: Array<{ symbol: string; assetClass: string; weightPct: string }>;
}
export interface Order {
  id: string; clientOrderId: string; symbol?: string; name?: string; side: 'buy' | 'sell'; type: string; timeInForce: string; quantity: string; filledQuantity: string;
  limitPrice: string | null; stopPrice: string | null; avgFillPrice: string | null; status: string; currency: string; estimatedPrice: string;
  estimatedCommission: Money; reserved: Money; rejectReason: string | null; createdAt: string; submittedAt: string | null; terminalAt: string | null;
}
export interface Preview {
  symbol: string; name: string; side: string; type: string; timeInForce: string; quantity: string; quote: Quote; estimatedPrice: string;
  estimatedNotional: Money; estimatedCommission: Money; estimatedTotal: Money; reserveAmount: Money; availableCash: Money;
  warnings: string[]; canSubmit: boolean; blockers: string[]; disclosure: string;
}
export interface Instrument { id: string; symbol: string; exchange: string; name: string; assetClass: string; currency: string; sector: string | null; fractionable: boolean; isTradable: boolean; isin?: string; description?: string | null }
export interface OnboardingStatus {
  applicationId: string; status: string; decisionReason: string | null;
  steps: { emailVerified: boolean; mfaEnabled: boolean; profileComplete: boolean; disclosuresAccepted: boolean; submitted: boolean };
  missingProfileFields: string[]; documents: Array<{ key: string; version: string; title: string; accepted: boolean }>;
  profile: Record<string, string | boolean | null> | null; brokerageAccount: { status: string; accountNumber: string | null } | null;
}

export const ORDER_STATUS_TONE: Record<string, 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'accent'> = {
  pending_submit: 'warning', submitted: 'info', accepted: 'info', partially_filled: 'accent', filled: 'positive',
  pending_cancel: 'warning', canceled: 'neutral', rejected: 'negative', expired: 'neutral', failed: 'negative',
};
export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
