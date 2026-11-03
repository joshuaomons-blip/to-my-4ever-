import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

export const POST = route(
  { auth: 'admin', permission: 'customers:manage', schema: z.object({ action: z.enum(['suspend', 'reactivate']), reason: z.string().trim().max(300).default('') }) },
  async ({ params, body, user, ip }) => {
    const target = await prisma.user.findFirst({ where: { id: params.id, role: 'CUSTOMER' } })
    if (!target) throw new ApiError(404, 'Customer not found')
    if (body.action === 'suspend' && body.reason.length < 3) throw new ApiError(422, 'A reason is required to suspend an account', { reason: 'Required' })
    await prisma.$transaction(async (db) => {
      await db.user.update({
        where: { id: target.id },
        data: body.action === 'suspend' ? { status: 'SUSPENDED', suspendedReason: body.reason } : { status: 'ACTIVE', suspendedReason: null },
      })
      if (body.action === 'suspend') await db.session.deleteMany({ where: { userId: target.id } })
      if (body.reason) await db.adminNote.create({ data: { authorId: user.id, subjectId: target.id, context: 'customer', body: `[${body.action}] ${body.reason}` } })
    })
    await audit({ actor: user, action: `customer.${body.action === 'suspend' ? 'suspended' : 'reactivated'}`, targetType: 'user', targetId: target.id, metadata: { reason: body.reason }, ip })
    return { ok: true }
  },
)
