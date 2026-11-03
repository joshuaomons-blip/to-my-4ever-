import { route } from '@/server/http'
import { changePasswordSchema } from '@/lib/validation'
import { changePassword } from '@/server/services/auth'
import { getSessionId } from '@/server/auth/session'

export const POST = route(
  { auth: 'admin', allowMfaSetup: true, schema: changePasswordSchema, rateLimit: { name: 'admin-pw', limit: 10, windowSeconds: 900 } },
  async ({ body, user, ip }) => {
    await changePassword(user, body.currentPassword, body.newPassword, await getSessionId('admin'), ip)
    return { ok: true }
  },
)
