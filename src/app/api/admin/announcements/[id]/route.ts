import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { announcementSchema } from '@/lib/admin-schemas'

export const PATCH = route({ auth: 'admin', permission: 'content:manage', schema: announcementSchema.partial() }, async ({ params, body, user, ip }) => {
  const a = await prisma.announcement.update({ where: { id: params.id }, data: body })
  await audit({ actor: user, action: 'announcement.updated', targetType: 'announcement', targetId: a.id, metadata: body, ip })
  return { announcement: a }
})

export const DELETE = route({ auth: 'admin', permission: 'content:manage' }, async ({ params, user, ip }) => {
  await prisma.announcement.delete({ where: { id: params.id } })
  await audit({ actor: user, action: 'announcement.deleted', targetType: 'announcement', targetId: params.id, ip })
  return { ok: true }
})
