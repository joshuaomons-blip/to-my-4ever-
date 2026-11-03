import { route } from '@/server/http'
import { forgotSchema } from '@/lib/validation'
import { requestPasswordReset } from '@/server/services/auth'

export const POST = route(
  { auth: 'none', schema: forgotSchema, rateLimit: { name: 'forgot', limit: 5, windowSeconds: 900 } },
  async ({ body, ip }) => {
    await requestPasswordReset(body.email, ip)
    return { ok: true, message: 'If an account exists for that email, a reset link has been sent.' }
  },
)
