/**
 * Contract for a REGULATED payment provider (e-money / payment institution, bank, or licensed PSP).
 * The platform never holds customer funds directly outside an approved client-money or partner
 * arrangement; the funds-flow design must be approved before live use (see launch gate payments_agreement).
 */
export interface PaymentMethodInput {
  userId: string;
  type: 'bank_account' | 'card' | 'mobile_money' | 'wallet';
  label: string;
  last4: string;
  currency: string;
  holderName: string;
}

export interface ProviderPaymentMethod {
  providerMethodId: string;
  verified: boolean;
}

export interface ProviderPayment {
  providerId: string;
  status: 'pending' | 'succeeded' | 'failed';
  nextAction?: { type: 'redirect'; url: string } | null;
}

export interface PaymentWebhookEvent {
  eventId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.returned' | 'payout.completed' | 'payout.failed';
  providerId: string;
  failureReason?: string;
  occurredAt: string;
}

export interface PaymentAdapter {
  readonly name: string;
  readonly isSandbox: boolean;
  addPaymentMethod(input: PaymentMethodInput): Promise<ProviderPaymentMethod>;
  createDeposit(input: { reference: string; amountMinor: bigint; currency: string; providerMethodId: string }): Promise<ProviderPayment>;
  createPayout(input: { reference: string; amountMinor: bigint; currency: string; providerMethodId: string }): Promise<ProviderPayment>;
  /** Verify signature + freshness and parse. Throws on invalid signatures. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: Buffer): PaymentWebhookEvent;
}

export const PAYMENT_ADAPTER = Symbol('PAYMENT_ADAPTER');
