import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { mfaSchema } from '@/lib/validation'
import { completeMfa } from '@/server/services/auth'
import { getPendingMfa } from '@/server/auth/session'

export const POST = route(
  { auth: 'none', schema: mfaSchema.extend({ scope: z.enum(['customer', 'admin']) }), rateLimit: { name: 'mfa', limit: 10, windowSeconds: 300 } },
  async ({ body, ip }) => {
    const pending = await getPendingMfa(body.scope)
    if (!pending) throw new ApiError(401, 'Your sign-in session expired. Please sign in again.')
    await completeMfa(body.scope, pending.session.id, pending.user, body.code, ip)
    return { ok: true }
  },
)
