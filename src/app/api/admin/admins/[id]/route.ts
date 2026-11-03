import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { updateAdminSchema } from '@/lib/admin-schemas'
import { isAdminRole } from '@/server/auth/permissions'

export const PATCH = route({ auth: 'admin', permission: 'admins:manage', schema: updateAdminSchema }, async ({ params, body, user, ip }) => {
  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target || !isAdminRole(target.role)) throw new ApiError(404, 'Administrator not found')
  if (target.id === user.id && (body.role && body.role !== 'SUPER_ADMIN' || body.status === 'SUSPENDED'))
    throw new ApiError(400, 'You cannot demote or suspend your own account')
  if (target.role === 'SUPER_ADMIN' && (body.role !== undefined && body.role !== 'SUPER_ADMIN' || body.status === 'SUSPENDED')) {
    const supers = await prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } })
    if (supers <= 1) throw new ApiError(400, 'At least one active super administrator is required')
  }
  const role = body.role ?? target.role
  const permissions = role === 'SUPER_ADMIN' ? [] : (body.permissions ?? target.permissions).filter((p) => p !== 'admins:manage')
  await prisma.user.update({ where: { id: target.id }, data: { role, permissions, ...(body.status ? { status: body.status } : {}) } })
  if (body.status === 'SUSPENDED') await prisma.session.deleteMany({ where: { userId: target.id } })
  await audit({ actor: user, action: 'admin.updated', targetType: 'user', targetId: target.id, metadata: { role, permissions, status: body.status }, ip })
  return { ok: true }
})
