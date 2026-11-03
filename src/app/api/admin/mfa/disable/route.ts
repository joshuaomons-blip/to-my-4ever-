import { z } from 'zod'
import { route } from '@/server/http'
import { mfaSchema } from '@/lib/validation'
import { disableMfa } from '@/server/services/mfa'

export const POST = route(
  { auth: 'admin', allowMfaSetup: true, schema: mfaSchema.extend({ password: z.string().min(1).max(128) }), rateLimit: { name: 'mfa-disable', limit: 10, windowSeconds: 300 } },
  async ({ body, user, ip }) => {
    await disableMfa(user, body.password, body.code, ip)
    return { ok: true }
  },
)
