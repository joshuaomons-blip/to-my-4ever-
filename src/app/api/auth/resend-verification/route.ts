import { route, ApiError } from '@/server/http'
import { sendVerificationEmail } from '@/server/services/auth'
import { rateLimit } from '@/server/security/rateLimit'

export const POST = route({ auth: 'customer' }, async ({ user }) => {
  if (user.emailVerifiedAt) throw new ApiError(400, 'Email already verified')
  if (!(await rateLimit(`resend:${user.id}`, 3, 900))) throw new ApiError(429, 'Please wait before requesting another email')
  await sendVerificationEmail(user)
  return { ok: true }
})
