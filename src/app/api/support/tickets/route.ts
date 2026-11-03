import { route } from '@/server/http'
import { ticketSchema } from '@/lib/validation'
import { openTicket } from '@/server/services/support'

export const POST = route({ auth: 'customer', schema: ticketSchema, rateLimit: { name: 'ticket', limit: 10, windowSeconds: 3600 } }, async ({ body, user, ip }) => {
  const t = await openTicket(user, body, ip)
  return { id: t.id, reference: t.reference }
})
