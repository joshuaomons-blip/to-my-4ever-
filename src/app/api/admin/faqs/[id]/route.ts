import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { faqSchema } from '@/lib/admin-schemas'

export const PATCH = route({ auth: 'admin', permission: 'content:manage', schema: faqSchema.partial() }, async ({ params, body, user, ip }) => {
  const f = await prisma.faq.update({ where: { id: params.id }, data: body })
  await audit({ actor: user, action: 'faq.updated', targetType: 'faq', targetId: f.id, ip })
  return { faq: f }
})

export const DELETE = route({ auth: 'admin', permission: 'content:manage' }, async ({ params, user, ip }) => {
  await prisma.faq.delete({ where: { id: params.id } })
  await audit({ actor: user, action: 'faq.deleted', targetType: 'faq', targetId: params.id, ip })
  return { ok: true }
})
