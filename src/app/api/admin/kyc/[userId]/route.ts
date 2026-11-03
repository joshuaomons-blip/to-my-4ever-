import { z } from 'zod'
import { route, ApiError } from '@/server/http'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

export const POST = route(
  {
    auth: 'admin',
    permission: 'kyc:review',
    schema: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).default(''), note: z.string().trim().max(1000).default('') }),
  },
  async ({ params, body, user, ip }) => {
    const kyc = await prisma.kycSubmission.findUnique({ where: { userId: params.userId } })
    if (!kyc) throw new ApiError(404, 'Submission not found')
    if (kyc.status !== 'PENDING') throw new ApiError(409, `Submission is ${kyc.status.toLowerCase()}, not pending`)
    if (body.decision === 'reject' && body.reason.length < 3) throw new ApiError(422, 'Give the customer a reason for rejection', { reason: 'Required' })
    const status = body.decision === 'approve' ? 'APPROVED' : 'REJECTED'
    await prisma.$transaction(async (db) => {
      const claimed = await db.kycSubmission.updateMany({
        where: { userId: params.userId, status: 'PENDING' },
        data: { status, reviewedAt: new Date(), reviewerId: user.id, decisionReason: body.reason || null },
      })
      if (claimed.count !== 1) throw new ApiError(409, 'Already reviewed')
      if (body.note) await db.adminNote.create({ data: { authorId: user.id, subjectId: params.userId, context: 'kyc', contextId: kyc.id, body: body.note } })
      await db.notification.create({
        data: {
          userId: params.userId,
          title: status === 'APPROVED' ? 'Identity verified (sandbox)' : 'Identity verification needs attention',
          body: status === 'APPROVED' ? 'You can now trade TSLA and request withdrawals in the sandbox.' : `Reason: ${body.reason}. You can update and resubmit your details.`,
          level: status === 'APPROVED' ? 'success' : 'warning',
        },
      })
    })
    await audit({ actor: user, action: `kyc.${status.toLowerCase()}`, targetType: 'user', targetId: params.userId, metadata: { reason: body.reason }, ip })
    return { ok: true }
  },
)
