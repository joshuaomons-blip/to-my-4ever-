import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { emailSchema, passwordSchema } from '@/lib/validation'
import { safeEqual } from '@/server/security/crypto'
import { createInitialSuperAdmin } from '@/server/services/auth'
import { createSession } from '@/server/auth/session'
import { audit } from '@/server/audit'

const schema = z.object({
  setupToken: z.string().min(1, 'Required').max(200),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: emailSchema,
  password: passwordSchema,
})

/** One-time super-admin bootstrap guarded by the ADMIN_SETUP_TOKEN environment variable. */
export const POST = route(
  { auth: 'none', schema, rateLimit: { name: 'admin-setup', limit: 5, windowSeconds: 900 } },
  async ({ body, ip }) => {
    const expected = process.env.ADMIN_SETUP_TOKEN ?? ''
    if (expected.length < 32) throw new ApiError(503, 'Setup is disabled: ADMIN_SETUP_TOKEN (32+ characters) is not configured on the server.')
    if (!safeEqual(body.setupToken, expected)) {
      await audit({ action: 'admin.setup_failed', ip })
      throw new ApiError(403, 'Invalid setup token', { setupToken: 'Invalid setup token' })
    }
    const admin = await createInitialSuperAdmin(body)
    await audit({ actor: admin, action: 'admin.setup_completed', targetType: 'user', targetId: admin.id, ip })
    await createSession(admin.id, 'admin', false)
    return { ok: true }
  },
)
