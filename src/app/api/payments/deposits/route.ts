import { route } from '@/server/http'
import { depositSchema } from '@/lib/validation'
import { createDeposit, toDepositDTO } from '@/server/payments/service'

/** Start a deposit with the configured payment provider. Nothing is credited here. */
export const POST = route(
  { auth: 'customer', schema: depositSchema, rateLimit: { name: 'deposit-create', limit: 20, windowSeconds: 3600 } },
  async ({ body, user, ip }) => ({ deposit: toDepositDTO(await createDeposit(user, body, ip)) }),
)
