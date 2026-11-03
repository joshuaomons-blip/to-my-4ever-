import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { hashPassword, randomToken } from '@/server/security/crypto'
import { createAdminSchema } from '@/lib/admin-schemas'
import { ROLE_DEFAULTS } from '@/server/auth/permissions'

export const POST = route({ auth: 'admin', permission: 'admins:manage', schema: createAdminSchema }, async ({ body, user, ip }) => {
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw new ApiError(409, 'That email is already registered', { email: 'Already registered' })
  // One-time temporary password shown once to the creating super admin; never stored in plain text.
  const tempPassword = randomToken(12) + 'A1'
  const permissions = body.role === 'SUPER_ADMIN' ? [] : (body.permissions ?? ROLE_DEFAULTS[body.role]).filter((p) => p !== 'admins:manage')
  const admin = await prisma.user.create({
    data: { email: body.email, firstName: body.firstName, lastName: body.lastName, role: body.role, permissions, passwordHash: await hashPassword(tempPassword), emailVerifiedAt: new Date() },
  })
  await audit({ actor: user, action: 'admin.created', targetType: 'user', targetId: admin.id, metadata: { email: admin.email, role: admin.role, permissions }, ip })
  return { id: admin.id, tempPassword }
})
