import { route } from '@/server/http'
import { depositSchema } from '@/lib/validation'
import { requestDeposit } from '@/server/services/ledger'
import { toTxDTO } from '@/server/services/portfolio'

export const POST = route({ auth: 'customer', schema: depositSchema }, async ({ body, user, ip }) => {
  const tx = await requestDeposit(user, body.amount, body.method, ip)
  return { transaction: toTxDTO(tx) }
})
