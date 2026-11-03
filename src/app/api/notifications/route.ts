import { z } from 'zod'
import { route } from '@/server/http'
import { prisma } from '@/server/db'

export const POST = route({ auth: 'customer', schema: z.object({ id: z.string().max(40).optional(), all: z.boolean().optional() }) }, async ({ body, user }) => {
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: body.id ?? '__none__' }) },
    data: { readAt: new Date() },
  })
  return { ok: true }
})
