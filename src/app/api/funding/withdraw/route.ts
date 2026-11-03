import { route } from '@/server/http'
import { withdrawSchema } from '@/lib/validation'
import { requestWithdrawal } from '@/server/services/ledger'
import { toTxDTO } from '@/server/services/portfolio'

export const POST = route({ auth: 'customer', schema: withdrawSchema }, async ({ body, user, ip }) => {
  const tx = await requestWithdrawal(user, body.amount, body.note, ip)
  return { transaction: toTxDTO(tx) }
})
