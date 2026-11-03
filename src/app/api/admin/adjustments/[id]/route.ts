import { z } from 'zod'
import { route } from '@/server/http'
import { decideAdjustment } from '@/server/services/adjustments'

export const POST = route(
  { auth: 'admin', permission: 'ledger:approve', schema: z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).default('') }) },
  async ({ params, body, user, ip }) => {
    const adj = await decideAdjustment(user, params.id, body.decision, body.note, ip)
    return { status: adj.status }
  },
)
