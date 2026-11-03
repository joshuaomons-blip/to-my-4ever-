import { route } from '@/server/http'
import { cancelDeposit } from '@/server/payments/service'

export const POST = route({ auth: 'customer' }, async ({ params, user, ip }) => {
  await cancelDeposit(user, params.id, ip)
  return { ok: true }
})
