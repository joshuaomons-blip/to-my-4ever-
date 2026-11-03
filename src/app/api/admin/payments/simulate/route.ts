import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { getTestProvider } from '@/server/payments'
import { paymentsConfig } from '@/server/payments/config'
import { processWebhook } from '@/server/payments/service'

/**
 * TEST MODE ONLY: simulate the test provider receiving a bank transfer for a deposit
 * reference (optionally a different amount, as happens with real transfers).
 * Disabled whenever a real provider is configured.
 */
export const POST = route(
  {
    auth: 'admin',
    permission: 'payments:review',
    schema: z.object({
      reference: z.string().trim().toUpperCase().regex(/^(DEMO-)?DEP-[A-Z0-9-]{6,30}$/, 'Enter a deposit reference like DEP-ABC123'),
      amount: z.number().positive('Enter the amount received').max(10_000_000),
      outcome: z.enum(['succeeded', 'failed']).default('succeeded'),
    }),
  },
  async ({ body, user, ip }) => {
    if (paymentsConfig().provider !== 'test') throw new ApiError(404, 'The payment simulator is only available in test mode')
    const d = await prisma.depositRequest.findUnique({ where: { reference: body.reference } })
    if (!d || d.provider !== 'test' || !d.providerSessionId) throw new ApiError(404, 'No test deposit with that reference', { reference: 'Not found' })
    const delivery = await getTestProvider().simulate(
      d.providerSessionId,
      body.outcome === 'succeeded' ? { kind: 'succeeded', amount: body.amount } : { kind: 'failed', reason: 'Transfer returned by the sending bank (test)' },
    )
    const result = await processWebhook('test', delivery.raw, delivery.headers)
    await audit({ actor: user, action: 'payments.test_simulated', targetType: 'deposit', targetId: d.id, metadata: { reference: d.reference, amount: body.amount, outcome: body.outcome }, ip })
    const fresh = await prisma.depositRequest.findUniqueOrThrow({ where: { id: d.id } })
    return { webhook: result.body, status: fresh.status }
  },
)
