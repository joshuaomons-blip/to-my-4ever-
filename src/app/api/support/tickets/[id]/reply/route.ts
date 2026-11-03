import { route } from '@/server/http'
import { ticketReplySchema } from '@/lib/validation'
import { replyToTicket } from '@/server/services/support'

export const POST = route({ auth: 'customer', schema: ticketReplySchema }, async ({ params, body, user, ip }) => {
  await replyToTicket(user, params.id, body.body, false, ip)
  return { ok: true }
})
