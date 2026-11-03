import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { ApiError } from '@/server/http'
import { audit } from '@/server/audit'
import { makeReference } from '@/server/security/crypto'
import { can } from '@/server/auth/permissions'
import type { SafeUser } from '@/server/auth/session'
import { paymentsConfig } from '@/server/payments/config'
import { ensureAccount } from './ledger'

const D = (n: number) => new Prisma.Decimal(n.toFixed(2))

/**
 * Balance corrections.
 * - Demo mode (no real money on the platform): an admin with ledger:adjust can credit or
 *   debit simulated cash immediately, with a written reason.
 * - Live mode: the correction is recorded as PENDING_APPROVAL with supporting evidence and
 *   is applied only when a DIFFERENT administrator with ledger:approve approves it.
 * Every correction is a visible ADJUSTMENT ledger entry; balances are never edited in place.
 */
export async function requestAdjustment(admin: SafeUser, input: { userId: string; amount: number; reason: string; evidence?: string }, ip: string) {
  const customer = await prisma.user.findFirst({ where: { id: input.userId, role: 'CUSTOMER' } })
  if (!customer) throw new ApiError(404, 'Customer not found')
  const livemode = paymentsConfig().livemode
  if (livemode && (!input.evidence || input.evidence.length < 4)) {
    throw new ApiError(422, 'Real-money corrections need a supporting reference, such as a provider payment ID or bank statement line', { evidence: 'Required in live mode' })
  }
  await ensureAccount(customer.id)
  const adj = await prisma.ledgerAdjustment.create({
    data: {
      reference: makeReference('ADJ'),
      userId: customer.id,
      amount: D(input.amount),
      reason: input.reason,
      evidence: input.evidence || null,
      livemode,
      requestedById: admin.id,
    },
  })
  await audit({ actor: admin, action: 'adjustment.requested', targetType: 'user', targetId: customer.id, metadata: { reference: adj.reference, amount: input.amount, reason: input.reason, livemode }, ip })
  if (!livemode) return applyAdjustment(admin, adj.id, 'Demo-mode correction (single approval)', ip)
  return adj
}

async function applyAdjustment(approver: SafeUser, id: string, note: string, ip: string) {
  const result = await prisma.$transaction(async (db) => {
    const adj = await db.ledgerAdjustment.findUniqueOrThrow({ where: { id } })
    const amount = Number(adj.amount)
    const account = await db.account.findUniqueOrThrow({ where: { userId: adj.userId } })
    if (amount < 0) {
      const debited = await db.account.updateMany({ where: { id: account.id, cashBalance: { gte: D(-amount) } }, data: { cashBalance: { decrement: D(-amount) } } })
      if (debited.count !== 1) throw new ApiError(422, 'The customer’s cash balance is lower than this debit', { amount: 'Exceeds cash balance' })
    } else {
      await db.account.update({ where: { id: account.id }, data: { cashBalance: { increment: D(amount) } } })
    }
    const tx = await db.transaction.create({
      data: {
        reference: adj.reference,
        userId: adj.userId,
        type: 'ADJUSTMENT',
        status: 'COMPLETED',
        amount: adj.amount,
        method: adj.livemode ? 'Approved ledger correction' : 'Demo balance correction',
        adminNote: adj.reason,
        reviewerId: approver.id,
        reviewedAt: new Date(),
        livemode: adj.livemode,
        completedAt: new Date(),
      },
    })
    const claimed = await db.ledgerAdjustment.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: { status: 'APPLIED', approverId: approver.id, decidedAt: new Date(), decisionNote: note || null, transactionId: tx.id },
    })
    if (claimed.count !== 1) throw new ApiError(409, 'This correction was already decided')
    await db.notification.create({
      data: {
        userId: adj.userId,
        title: 'Balance correction',
        body: `A ${amount >= 0 ? 'credit' : 'debit'} of $${Math.abs(amount).toFixed(2)} (${adj.reference}) was applied to your cash balance. Reason: ${adj.reason}`,
        level: 'info',
      },
    })
    return db.ledgerAdjustment.findUniqueOrThrow({ where: { id } })
  })
  await audit({ actor: approver, action: 'adjustment.applied', targetType: 'user', targetId: result.userId, metadata: { reference: result.reference, amount: Number(result.amount), note }, ip })
  return result
}

export async function decideAdjustment(approver: SafeUser, id: string, decision: 'approve' | 'reject', note: string, ip: string) {
  const adj = await prisma.ledgerAdjustment.findUnique({ where: { id } })
  if (!adj) throw new ApiError(404, 'Correction not found')
  if (adj.status !== 'PENDING_APPROVAL') throw new ApiError(409, 'This correction was already decided')
  if (!can(approver, 'ledger:approve')) throw new ApiError(403, 'You need the ledger:approve permission')
  if (adj.requestedById === approver.id) throw new ApiError(403, 'A different administrator must approve this correction')
  if (decision === 'approve') return applyAdjustment(approver, id, note, ip)
  if (note.length < 3) throw new ApiError(422, 'Explain why the correction is rejected', { note: 'Required' })
  const r = await prisma.ledgerAdjustment.update({ where: { id }, data: { status: 'REJECTED', approverId: approver.id, decidedAt: new Date(), decisionNote: note } })
  await audit({ actor: approver, action: 'adjustment.rejected', targetType: 'user', targetId: adj.userId, metadata: { reference: adj.reference, note }, ip })
  return r
}
