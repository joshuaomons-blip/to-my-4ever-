import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { broadcastSchema } from '@/lib/admin-schemas'

export const POST = route({ auth: 'admin', permission: 'content:manage', schema: broadcastSchema }, async ({ body, user, ip }) => {
  let userIds: string[]
  if (body.audience === 'all') {
    userIds = (await prisma.user.findMany({ where: { role: 'CUSTOMER', status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id)
  } else {
    const target = await prisma.user.findFirst({ where: { email: body.email ?? '', role: 'CUSTOMER' }, select: { id: true } })
    if (!target) throw new ApiError(404, 'No customer with that email', { email: 'Customer not found' })
    userIds = [target.id]
  }
  await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, title: body.title, body: body.body, level: body.level })) })
  await audit({ actor: user, action: 'notification.sent', metadata: { audience: body.audience, email: body.email, recipients: userIds.length, title: body.title }, ip })
  return { ok: true, recipients: userIds.length }
})
