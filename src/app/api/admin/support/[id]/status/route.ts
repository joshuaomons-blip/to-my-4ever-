import { z } from 'zod'
import { route } from '@/server/http'
import { setTicketStatus } from '@/server/services/support'

export const POST = route({ auth: 'admin', permission: 'support:manage', schema: z.object({ status: z.enum(['OPEN', 'CLOSED']) }) }, async ({ params, body, user, ip }) => {
  await setTicketStatus(user, params.id, body.status, true, ip)
  return { ok: true }
})
