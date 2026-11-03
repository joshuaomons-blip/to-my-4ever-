import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

export const POST = route(
  { auth: 'admin', permission: 'customers:manage', schema: z.object({ flagged: z.boolean(), reason: z.string().trim().max(300).default('') }) },
  async ({ params, body, user, ip }) => {
    const target = await prisma.user.findFirst({ where: { id: params.id, role: 'CUSTOMER' } })
    if (!target) throw new ApiError(404, 'Customer not found')
    if (body.flagged && body.reason.length < 3) throw new ApiError(422, 'Describe the suspicious activity', { reason: 'Required' })
    await prisma.user.update({ where: { id: target.id }, data: { flagged: body.flagged, flagReason: body.flagged ? body.reason : null } })
    await prisma.adminNote.create({ data: { authorId: user.id, subjectId: target.id, context: 'customer', body: body.flagged ? `[flagged] ${body.reason}` : `[unflagged] ${body.reason || 'Flag cleared'}` } })
    await audit({ actor: user, action: body.flagged ? 'customer.flagged' : 'customer.unflagged', targetType: 'user', targetId: target.id, metadata: { reason: body.reason }, ip })
    return { ok: true }
  },
)
