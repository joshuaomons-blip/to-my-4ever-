import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { announcementSchema } from '@/lib/admin-schemas'

export const POST = route({ auth: 'admin', permission: 'content:manage', schema: announcementSchema }, async ({ body, user, ip }) => {
  const a = await prisma.announcement.create({ data: body })
  await audit({ actor: user, action: 'announcement.created', targetType: 'announcement', targetId: a.id, metadata: { title: a.title }, ip })
  return { announcement: a }
})
