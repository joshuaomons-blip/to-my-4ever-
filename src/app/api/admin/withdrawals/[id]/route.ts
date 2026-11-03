import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { reviewWithdrawal } from '@/server/services/ledger'
import { toTxDTO } from '@/server/services/portfolio'

export const POST = route(
  { auth: 'admin', permission: 'withdrawals:review', schema: z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).default('') }) },
  async ({ params, body, user, ip }) => {
    if (body.decision === 'reject' && body.note.length < 3) throw new ApiError(422, 'Add a note explaining the rejection', { note: 'Required' })
    const tx = await reviewWithdrawal(user, params.id, body.decision, body.note, ip)
    return { transaction: toTxDTO(tx) }
  },
)
