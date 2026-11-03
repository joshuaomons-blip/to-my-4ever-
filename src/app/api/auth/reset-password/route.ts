import { route } from '@/server/http'
import { resetSchema } from '@/lib/validation'
import { resetPassword } from '@/server/services/auth'

export const POST = route(
  { auth: 'none', schema: resetSchema, rateLimit: { name: 'reset', limit: 10, windowSeconds: 900 } },
  async ({ body, ip }) => {
    await resetPassword(body.token, body.password, ip)
    return { ok: true }
  },
)
