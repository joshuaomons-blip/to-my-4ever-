import { route } from '@/server/http'
import { loginSchema } from '@/lib/validation'
import { login } from '@/server/services/auth'

export const POST = route(
  { auth: 'none', schema: loginSchema, rateLimit: { name: 'login', limit: 10, windowSeconds: 300 } },
  async ({ body, ip }) => login('customer', body.email, body.password, ip),
)
