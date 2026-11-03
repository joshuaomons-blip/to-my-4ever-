import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

export const POST = route({ auth: 'admin', permission: 'customers:manage' }, async ({ params, user, ip }) => {
  const { count } = await prisma.session.deleteMany({ where: { userId: params.id, user: { role: 'CUSTOMER' } } })
  await audit({ actor: user, action: 'customer.sessions_revoked', targetType: 'user', targetId: params.id, metadata: { count }, ip })
  return { ok: true, count }
})
