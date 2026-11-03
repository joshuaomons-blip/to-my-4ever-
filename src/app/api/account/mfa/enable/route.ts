import { route } from '@/server/http'
import { mfaSchema } from '@/lib/validation'
import { confirmMfa } from '@/server/services/mfa'

export const POST = route(
  { auth: 'customer', schema: mfaSchema, rateLimit: { name: 'mfa-enable', limit: 10, windowSeconds: 300 } },
  async ({ body, user, ip }) => {
    await confirmMfa(user, body.code, ip)
    return { ok: true }
  },
)
