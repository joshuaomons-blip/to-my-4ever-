import type { PaymentMethod } from '@prisma/client'

export type ProviderId = 'test' | 'stripe'

/** What the provider itself says about a payment session, fetched from its API. */
export type ProviderSessionState = {
  status: 'awaiting' | 'processing' | 'succeeded' | 'failed' | 'expired'
  amount?: number
  currency?: string
  paymentId?: string
  livemode: boolean
  failureReason?: string
}

export type WebhookEvent = { eventId: string; type: string; sessionId?: string; payload: unknown }

export type CheckoutResult = {
  sessionId: string
  /** Hosted payment page to redirect the customer to (cards, bank debits). */
  checkoutUrl?: string
  /** Push-payment instructions shown to the customer (bank transfers). */
  instructions?: Record<string, string>
  expiresAt: Date
}

/**
 * A payment provider integration. Implementations must be server-only:
 * they hold secrets and talk to the provider's API.
 */
export interface PaymentProvider {
  readonly id: ProviderId
  readonly label: string
  readonly livemode: boolean
  readonly methods: PaymentMethod[]

  createCheckout(input: {
    depositId: string
    reference: string
    amount: number
    currency: string
    method: PaymentMethod
    customer: { email: string; name: string }
  }): Promise<CheckoutResult>

  /** Verify the webhook signature over the exact raw body. Never parse before verifying. */
  verifyWebhook(rawBody: string, headers: Headers): { ok: true; event: WebhookEvent } | { ok: false; reason: string }

  /** Independently re-read the session from the provider (the source of truth). */
  retrieveSession(sessionId: string): Promise<ProviderSessionState>

  /** Return funds to the original payment method. */
  refund(input: { paymentId: string; amount: number; reference: string }): Promise<{ refundId: string }>

  /** Best-effort: stop a pending session from being paid. */
  cancelSession?(sessionId: string): Promise<void>
}
