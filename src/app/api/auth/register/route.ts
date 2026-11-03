import { route } from '@/server/http'
import { registerSchema } from '@/lib/validation'
import { registerCustomer } from '@/server/services/auth'

export const POST = route(
  { auth: 'none', schema: registerSchema, rateLimit: { name: 'register', limit: 5, windowSeconds: 3600 } },
  async ({ body, ip }) => {
    await registerCustomer(body, ip)
    return { ok: true, message: 'Account created. Check your sandbox mailbox to verify your email.' }
  },
)
