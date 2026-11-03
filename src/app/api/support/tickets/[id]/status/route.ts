import { z } from 'zod'
import { route } from '@/server/http'
import { setTicketStatus } from '@/server/services/support'

export const POST = route({ auth: 'customer', schema: z.object({ status: z.enum(['OPEN', 'CLOSED']) }) }, async ({ params, body, user, ip }) => {
  await setTicketStatus(user, params.id, body.status, false, ip)
  return { ok: true }
})
