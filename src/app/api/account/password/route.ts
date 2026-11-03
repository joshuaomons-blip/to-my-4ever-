import { route } from '@/server/http'
import { changePasswordSchema } from '@/lib/validation'
import { changePassword } from '@/server/services/auth'
import { getSessionId } from '@/server/auth/session'

export const POST = route(
  { auth: 'customer', schema: changePasswordSchema, rateLimit: { name: 'pw-change', limit: 10, windowSeconds: 900 } },
  async ({ body, user, ip }) => {
    await changePassword(user, body.currentPassword, body.newPassword, await getSessionId('customer'), ip)
    return { ok: true }
  },
)
