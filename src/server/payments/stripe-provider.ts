import 'server-only'
import type { PaymentProvider, ProviderSessionState } from './types'
import { verifySignature } from './signature'

const API = 'https://api.stripe.com/v1'
const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

function form(params: Record<string, string | number | undefined>) {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v))
  return body
}

type StripeSession = {
  id: string
  url?: string
  status: 'open' | 'complete' | 'expired'
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  amount_total: number | null
  currency: string | null
  livemode: boolean
  payment_intent: null | string | { id: string; status: string; last_payment_error?: { message?: string } | null }
}

/**
 * Stripe Checkout integration (cards and US bank account debits via ACH).
 * Uses the REST API directly so no secret ever reaches the browser.
 * Webhook endpoint to configure in Stripe: {APP_URL}/api/webhooks/payments/stripe
 * Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *         checkout.session.async_payment_failed, checkout.session.expired
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe' as const
  readonly label: string
  readonly livemode: boolean
  readonly methods = ['CARD', 'BANK_TRANSFER'] as const as unknown as PaymentProvider['methods']

  constructor(private readonly secretKey: string, private readonly webhookSecret: string) {
    this.livemode = /^(sk|rk)_live_/.test(secretKey)
    this.label = this.livemode ? 'Stripe (live)' : 'Stripe (test mode)'
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<T> {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        'Stripe-Version': '2024-06-20',
      },
      body,
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`)
    return json as T
  }

  async createCheckout(input: Parameters<PaymentProvider['createCheckout']>[0]) {
    const expiresAt = new Date(Date.now() + (input.method === 'CARD' ? 60 : 24 * 60) * 60_000)
    const session = await this.call<StripeSession>(
      'POST',
      '/checkout/sessions',
      form({
        mode: 'payment',
        'payment_method_types[0]': input.method === 'CARD' ? 'card' : 'us_bank_account',
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': input.currency,
        'line_items[0][price_data][unit_amount]': Math.round(input.amount * 100),
        'line_items[0][price_data][product_data][name]': `Account deposit ${input.reference}`,
        customer_email: input.customer.email,
        client_reference_id: input.depositId,
        'metadata[deposit_id]': input.depositId,
        'metadata[reference]': input.reference,
        'payment_intent_data[metadata][deposit_id]': input.depositId,
        'payment_intent_data[description]': `Deposit ${input.reference}`,
        success_url: `${appUrl()}/account/funding/${input.depositId}?return=success`,
        cancel_url: `${appUrl()}/account/funding/${input.depositId}?return=cancelled`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      }),
      `deposit-${input.depositId}`,
    )
    return { sessionId: session.id, checkoutUrl: session.url, expiresAt }
  }

  verifyWebhook(raw: string, headers: Headers) {
    const v = verifySignature(this.webhookSecret, raw, headers.get('stripe-signature'))
    if (!v.ok) return v
    const body = JSON.parse(raw) as { id: string; type: string; data?: { object?: { id?: string; object?: string } } }
    const obj = body.data?.object
    return { ok: true as const, event: { eventId: body.id, type: body.type, sessionId: obj?.object === 'checkout.session' ? obj.id : undefined, payload: body } }
  }

  async retrieveSession(sessionId: string): Promise<ProviderSessionState> {
    const s = await this.call<StripeSession>('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`)
    const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null
    const base = { livemode: s.livemode, currency: s.currency ?? undefined, amount: s.amount_total != null ? s.amount_total / 100 : undefined, paymentId: pi?.id ?? (typeof s.payment_intent === 'string' ? s.payment_intent : undefined) }
    if (s.payment_status === 'paid' && (!pi || pi.status === 'succeeded')) return { ...base, status: 'succeeded' }
    if (s.status === 'expired') return { ...base, status: 'expired' }
    if (pi?.status === 'processing') return { ...base, status: 'processing' }
    if (pi?.status === 'requires_payment_method' && pi.last_payment_error) return { ...base, status: 'failed', failureReason: pi.last_payment_error.message ?? 'Payment failed' }
    if (pi?.status === 'canceled') return { ...base, status: 'failed', failureReason: 'Payment cancelled' }
    return { ...base, status: s.status === 'complete' ? 'processing' : 'awaiting' }
  }

  async refund({ paymentId, amount, reference }: { paymentId: string; amount: number; reference: string }) {
    const r = await this.call<{ id: string }>('POST', '/refunds', form({ payment_intent: paymentId, amount: Math.round(amount * 100), 'metadata[withdrawal_reference]': reference }), `refund-${reference}-${paymentId}`)
    return { refundId: r.id }
  }

  async cancelSession(sessionId: string) {
    await this.call('POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`).catch(() => {})
  }
}
