import 'server-only'
import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PaymentProvider, ProviderSessionState } from './types'
import { signPayload, verifySignature } from './signature'
import { testWebhookSecret } from './config'

const id = (p: string) => `${p}_test_${randomBytes(10).toString('hex')}`

/**
 * Built-in TEST payment provider. It behaves like a real provider: it issues
 * sessions, keeps its own record of payments (TestProviderPayment), and notifies
 * the platform with signed webhooks. No real money is ever involved.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly id = 'test' as const
  readonly label = 'Test payments (no real money)'
  readonly livemode = false
  readonly methods = ['BANK_TRANSFER', 'CARD'] as const as unknown as PaymentProvider['methods']

  async createCheckout(input: Parameters<PaymentProvider['createCheckout']>[0]) {
    const sessionId = id('cs')
    if (input.method === 'CARD') {
      return { sessionId, checkoutUrl: `/account/funding/test-checkout/${input.depositId}`, expiresAt: new Date(Date.now() + 60 * 60_000) }
    }
    return {
      sessionId,
      instructions: {
        'Account name': 'TEST MODE — do not send money',
        Bank: 'Test Bank (simulated)',
        'Account number': '000123456789',
        'Routing number': '110000000',
        'Payment reference': input.reference,
        Amount: `${input.amount.toFixed(2)} ${input.currency.toUpperCase()}`,
      },
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    }
  }

  verifyWebhook(raw: string, headers: Headers) {
    const v = verifySignature(testWebhookSecret(), raw, headers.get('test-signature'))
    if (!v.ok) return v
    const body = JSON.parse(raw) as { id: string; type: string; data?: { session_id?: string } }
    return { ok: true as const, event: { eventId: body.id, type: body.type, sessionId: body.data?.session_id, payload: body } }
  }

  async retrieveSession(sessionId: string): Promise<ProviderSessionState> {
    const payments = await prisma.testProviderPayment.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' } })
    const ok = payments.find((p) => p.status === 'succeeded')
    if (ok) return { status: 'succeeded', amount: Number(ok.amount), currency: ok.currency, paymentId: ok.id, livemode: false }
    const failed = payments[0]
    if (failed) return { status: 'failed', failureReason: failed.reason ?? 'Payment failed', livemode: false }
    return { status: 'awaiting', livemode: false }
  }

  async refund({ paymentId, amount }: { paymentId: string; amount: number }) {
    const p = await prisma.testProviderPayment.findUnique({ where: { id: paymentId } })
    if (!p || p.status !== 'succeeded') throw new Error('Payment not refundable')
    if (Number(p.amount) - Number(p.refunded) < amount - 0.001) throw new Error('Refund exceeds remaining amount')
    await prisma.testProviderPayment.update({ where: { id: paymentId }, data: { refunded: { increment: new Prisma.Decimal(amount.toFixed(2)) } } })
    return { refundId: id('re') }
  }

  /**
   * TEST ONLY: what the provider would do when money arrives (or a card is declined).
   * Records the payment on the provider side and returns a signed webhook delivery.
   */
  async simulate(sessionId: string, outcome: { kind: 'succeeded'; amount: number } | { kind: 'failed'; reason: string }) {
    const paymentId = id('py')
    await prisma.testProviderPayment.create({
      data: {
        id: paymentId,
        sessionId,
        amount: new Prisma.Decimal(outcome.kind === 'succeeded' ? outcome.amount.toFixed(2) : '0'),
        status: outcome.kind,
        reason: outcome.kind === 'failed' ? outcome.reason : null,
      },
    })
    const raw = JSON.stringify({
      id: id('evt'),
      type: outcome.kind === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
      created: Math.floor(Date.now() / 1000),
      data: { session_id: sessionId, payment_id: paymentId },
    })
    return { raw, headers: new Headers({ 'test-signature': signPayload(testWebhookSecret(), raw), 'content-type': 'application/json' }) }
  }
}
