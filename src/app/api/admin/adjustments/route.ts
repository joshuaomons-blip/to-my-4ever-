import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { adjustmentSchema } from '@/lib/validation'
import { requestAdjustment } from '@/server/services/adjustments'

/** Request a documented balance correction for a customer (by ID or email). */
export const POST = route(
  { auth: 'admin', permission: 'ledger:adjust', schema: adjustmentSchema.extend({ customer: z.string().trim().min(3, 'Enter the customer email').max(160) }) },
  async ({ body, user, ip }) => {
    const c = await prisma.user.findFirst({ where: { role: 'CUSTOMER', OR: [{ id: body.customer }, { email: body.customer.toLowerCase() }] }, select: { id: true } })
    if (!c) throw new ApiError(404, 'No customer with that email or ID', { customer: 'Customer not found' })
    const adj = await requestAdjustment(user, { userId: c.id, amount: body.amount, reason: body.reason, evidence: body.evidence }, ip)
    return { reference: adj.reference, status: adj.status }
  },
)
