import { route } from '@/server/http'
import { loginSchema } from '@/lib/validation'
import { login } from '@/server/services/auth'

export const POST = route(
  { auth: 'none', schema: loginSchema, rateLimit: { name: 'admin-login', limit: 5, windowSeconds: 300 } },
  async ({ body, ip }) => login('admin', body.email, body.password, ip),
)
