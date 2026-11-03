import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { getTestProvider } from '@/server/payments'
import { paymentsConfig } from '@/server/payments/config'
import { processWebhook } from '@/server/payments/service'

const OUTCOMES = {
  succeeded: null,
  declined: 'Your card was declined (test card 4000 0000 0000 0002).',
  insufficient_funds: 'Insufficient funds (test card 4000 0000 0000 9995).',
} as const

/**
 * TEST MODE ONLY. Acts as the customer completing the test provider's checkout
 * (card) or their bank sending the transfer (bank). The provider records the payment
 * and sends a signed webhook, which the platform verifies exactly as it would a real one.
 */
export const POST = route(
  { auth: 'customer', schema: z.object({ outcome: z.enum(['succeeded', 'declined', 'insufficient_funds']) }), rateLimit: { name: 'test-pay', limit: 30, windowSeconds: 300 } },
  async ({ params, body, user }) => {
    if (paymentsConfig().provider !== 'test') throw new ApiError(404, 'Test payments are disabled')
    const d = await prisma.depositRequest.findFirst({ where: { id: params.id, userId: user.id, provider: 'test' } })
    if (!d || !d.providerSessionId) throw new ApiError(404, 'Deposit not found')
    if (d.status !== 'AWAITING_PAYMENT') throw new ApiError(409, 'This deposit is no longer awaiting payment')
    const reason = OUTCOMES[body.outcome]
    const delivery = await getTestProvider().simulate(d.providerSessionId, reason ? { kind: 'failed', reason } : { kind: 'succeeded', amount: Number(d.amount) })
    const result = await processWebhook('test', delivery.raw, delivery.headers)
    if (result.status !== 200) throw new ApiError(502, 'The test webhook could not be processed')
    const fresh = await prisma.depositRequest.findUniqueOrThrow({ where: { id: d.id } })
    return { status: fresh.status }
  },
)
