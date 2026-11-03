import { route } from '@/server/http'
import { ticketReplySchema } from '@/lib/validation'
import { replyToTicket } from '@/server/services/support'

export const POST = route({ auth: 'admin', permission: 'support:manage', schema: ticketReplySchema }, async ({ params, body, user, ip }) => {
  await replyToTicket(user, params.id, body.body, true, ip)
  return { ok: true }
})
