import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'
import { faqSchema } from '@/lib/admin-schemas'

export const POST = route({ auth: 'admin', permission: 'content:manage', schema: faqSchema }, async ({ body, user, ip }) => {
  const f = await prisma.faq.create({ data: body })
  await audit({ actor: user, action: 'faq.created', targetType: 'faq', targetId: f.id, ip })
  return { faq: f }
})
