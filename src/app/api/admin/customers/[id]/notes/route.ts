import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

export const POST = route(
  { auth: 'admin', permission: 'customers:read', schema: z.object({ body: z.string().trim().min(2, 'Write a note').max(1000), context: z.enum(['customer', 'kyc']).default('customer') }) },
  async ({ params, body, user, ip }) => {
    const target = await prisma.user.findFirst({ where: { id: params.id, role: 'CUSTOMER' } })
    if (!target) throw new ApiError(404, 'Customer not found')
    const note = await prisma.adminNote.create({ data: { authorId: user.id, subjectId: target.id, context: body.context, body: body.body } })
    await audit({ actor: user, action: 'note.added', targetType: 'user', targetId: target.id, metadata: { context: body.context }, ip })
    return { note }
  },
)
