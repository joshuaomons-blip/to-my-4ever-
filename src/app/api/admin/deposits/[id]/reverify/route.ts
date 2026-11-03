import { route } from '@/server/http'
import { reverifyDeposit } from '@/server/payments/service'

/** Re-read the deposit from the payment provider. There is deliberately no "mark as paid" endpoint. */
export const POST = route({ auth: 'admin', permission: 'payments:review', rateLimit: { name: 'reverify', limit: 30, windowSeconds: 60 } }, async ({ params, user, ip }) =>
  reverifyDeposit(user, params.id, ip),
)
