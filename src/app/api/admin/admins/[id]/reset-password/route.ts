import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { hashPassword, randomToken } from '@/server/security/crypto'
import { isAdminRole } from '@/server/auth/permissions'

export const POST = route({ auth: 'admin', permission: 'admins:manage' }, async ({ params, user, ip }) => {
  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target || !isAdminRole(target.role)) throw new ApiError(404, 'Administrator not found')
  const tempPassword = randomToken(12) + 'A1'
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(tempPassword), failedLogins: 0, lockedUntil: null } })
  await prisma.session.deleteMany({ where: { userId: target.id } })
  await audit({ actor: user, action: 'admin.password_reset', targetType: 'user', targetId: target.id, ip })
  return { tempPassword }
})
