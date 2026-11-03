import { route } from '@/server/http'
import { tradeSchema } from '@/lib/validation'
import { placeOrder } from '@/server/services/ledger'
import { toTxDTO } from '@/server/services/portfolio'

export const POST = route(
  { auth: 'customer', schema: tradeSchema, rateLimit: { name: 'trade', limit: 30, windowSeconds: 60 } },
  async ({ body, user, ip }) => {
    const tx = await placeOrder(user, body, ip)
    return { transaction: toTxDTO(tx) }
  },
)
