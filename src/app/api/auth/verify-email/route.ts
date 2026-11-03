import { route, ApiError } from '@/server/http'
import { tokenSchema } from '@/lib/validation'
import { verifyEmail } from '@/server/services/auth'

export const POST = route(
  { auth: 'none', schema: tokenSchema, rateLimit: { name: 'verify', limit: 20, windowSeconds: 600 } },
  async ({ body, ip }) => {
    if (!(await verifyEmail(body.token, ip))) throw new ApiError(400, 'This verification link is invalid or has expired.')
    return { ok: true }
  },
)
