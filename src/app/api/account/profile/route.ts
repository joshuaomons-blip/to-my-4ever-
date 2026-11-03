import { route } from '@/server/http'
import { profileSchema } from '@/lib/validation'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

export const PATCH = route({ auth: 'customer', schema: profileSchema }, async ({ body, user, ip }) => {
  await prisma.user.update({ where: { id: user.id }, data: { firstName: body.firstName, lastName: body.lastName, phone: body.phone || null } })
  await audit({ actor: user, action: 'profile.updated', targetType: 'user', targetId: user.id, ip })
  return { ok: true }
})
