import { route } from '@/server/http'
import { cancelWithdrawal } from '@/server/services/ledger'
import { toTxDTO } from '@/server/services/portfolio'

export const POST = route({ auth: 'customer' }, async ({ params, user, ip }) => {
  const tx = await cancelWithdrawal(user, params.id, ip)
  return { transaction: toTxDTO(tx) }
})
