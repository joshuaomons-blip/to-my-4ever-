import { z } from 'zod'
import { route } from '@/server/http'
import { logout } from '@/server/services/auth'
import { getCurrentUser } from '@/server/auth/session'

export const POST = route({ auth: 'none', schema: z.object({ scope: z.enum(['customer', 'admin']) }) }, async ({ body, ip }) => {
  const user = await getCurrentUser(body.scope)
  await logout(body.scope, user, ip)
  return { ok: true }
})
