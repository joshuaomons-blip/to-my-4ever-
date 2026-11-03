import { route, ApiError } from '@/server/http'
import { kycSchema } from '@/lib/validation'
import { prisma } from '@/server/db'
import { audit } from '@/server/audit'

/** Sandbox KYC submission. No ID numbers or document images are collected or stored. */
export const POST = route({ auth: 'customer', schema: kycSchema }, async ({ body, user, ip }) => {
  if (!user.emailVerifiedAt) throw new ApiError(403, 'Verify your email before starting identity verification.')
  const existing = await prisma.kycSubmission.findUnique({ where: { userId: user.id } })
  if (existing?.status === 'PENDING') throw new ApiError(409, 'Your verification is already under review.')
  if (existing?.status === 'APPROVED') throw new ApiError(409, 'Your identity is already verified.')
   
  const { attest, dateOfBirth, ...rest } = body
  const data = { ...rest, dateOfBirth: new Date(dateOfBirth), status: 'PENDING' as const, submittedAt: new Date(), reviewedAt: null, reviewerId: null, decisionReason: null }
  await prisma.kycSubmission.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data })
  await audit({ actor: user, action: 'kyc.submitted', targetType: 'user', targetId: user.id, ip })
  return { ok: true }
})
