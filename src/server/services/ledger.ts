import 'server-only'
import { Prisma, type Transaction } from '@prisma/client'
import { prisma } from '@/server/db'
import { getBroker } from '@/server/broker'
import { getSettings } from '@/server/settings'
import { ApiError } from '@/server/http'
import { makeReference } from '@/server/security/crypto'
import { audit } from '@/server/audit'
import type { SafeUser } from '@/server/auth/session'
import { paymentsConfig } from '@/server/payments/config'
import { refundToSource } from '@/server/payments/service'

const D = (n: number, dp = 2) => new Prisma.Decimal(n.toFixed(dp))
export const round2 = (n: number) => Math.round(n * 100) / 100

export async function ensureAccount(userId: string) {
  const existing = await prisma.account.findUnique({ where: { userId } })
  if (existing) return existing
  for (let i = 0; i < 5; i++) {
    const accountNumber = 'SBX' + String(Math.floor(10_000_000 + Math.random() * 89_999_999))
    try {
      return await prisma.account.create({ data: { userId, accountNumber } })
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
      const raced = await prisma.account.findUnique({ where: { userId } })
      if (raced) return raced
    }
  }
  throw new Error('Could not allocate account number')
}

type Need = { emailVerified?: boolean; kyc?: boolean }

async function assertCanTransact(user: SafeUser, need: Need) {
  const settings = await getSettings()
  if (settings.maintenance.enabled) throw new ApiError(503, settings.maintenance.message || 'Platform under maintenance')
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'Your account is suspended. Please contact support.')
  if (need.emailVerified && !user.emailVerifiedAt) throw new ApiError(403, 'Please verify your email address first.')
  if (need.kyc) {
    const kyc = await prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } })
    if (kyc?.status !== 'APPROVED') throw new ApiError(403, 'Identity verification must be approved before trading or withdrawing.')
  }
  return settings
}

export async function requestWithdrawal(user: SafeUser, amount: number, note: string | undefined, ip: string) {
  const settings = await assertCanTransact(user, { emailVerified: true, kyc: true })
  if (amount < settings.trading.minWithdrawal)
    throw new ApiError(422, `Minimum sandbox withdrawal is $${settings.trading.minWithdrawal}`, { amount: `Minimum is $${settings.trading.minWithdrawal}` })
  const account = await ensureAccount(user.id)
  const reference = makeReference('WDL')
  const amt = D(amount)

  const tx = await prisma.$transaction(async (db) => {
    // Reserve funds atomically: fails if balance is insufficient.
    const reserved = await db.account.updateMany({
      where: { id: account.id, cashBalance: { gte: amt } },
      data: { cashBalance: { decrement: amt } },
    })
    if (reserved.count !== 1) throw new ApiError(422, 'Insufficient available cash for this withdrawal', { amount: 'Exceeds available cash' })
    return db.transaction.create({
      data: {
        reference,
        userId: user.id,
        type: 'WITHDRAWAL',
        status: 'PENDING',
        amount: amt,
        method: paymentsConfig().livemode ? 'Refund to original payment method' : 'Simulated bank transfer',
        customerNote: note || null,
        brokerMode: getBroker().mode,
        livemode: paymentsConfig().livemode,
      },
    })
  })
  await audit({ actor: user, action: 'withdrawal.requested', targetType: 'transaction', targetId: tx.id, metadata: { amount, reference }, ip })
  return tx
}

export async function cancelWithdrawal(user: SafeUser, txId: string, ip: string) {
  const tx = await prisma.$transaction(async (db) => {
    const claimed = await db.transaction.updateMany({
      where: { id: txId, userId: user.id, type: 'WITHDRAWAL', status: 'PENDING' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    })
    if (claimed.count !== 1) throw new ApiError(409, 'This withdrawal can no longer be cancelled')
    const t = await db.transaction.findUniqueOrThrow({ where: { id: txId } })
    await db.account.update({ where: { userId: user.id }, data: { cashBalance: { increment: t.amount } } })
    return t
  })
  await audit({ actor: user, action: 'withdrawal.cancelled', targetType: 'transaction', targetId: tx.id, ip })
  return tx
}

export async function reviewWithdrawal(admin: SafeUser, txId: string, decision: 'approve' | 'reject', note: string, ip: string) {
  const existing = await prisma.transaction.findUnique({ where: { id: txId }, include: { user: { include: { account: true } } } })
  if (!existing || existing.type !== 'WITHDRAWAL') throw new ApiError(404, 'Withdrawal not found')
  if (existing.status !== 'PENDING') throw new ApiError(409, `Withdrawal already ${existing.status.toLowerCase()}`)

  let brokerRef: string | null = null
  if (decision === 'approve') {
    if (existing.livemode) {
      // Real money leaves only through the payment provider, back to the original payment method.
      brokerRef = await refundToSource(existing.userId, Number(existing.amount), existing.reference)
    } else {
      const res = await getBroker().executeWithdrawal({
        accountNumber: existing.user.account?.accountNumber ?? '',
        amount: Number(existing.amount),
        reference: existing.reference,
      })
      brokerRef = res.brokerRef
    }
  }

  const tx = await prisma.$transaction(async (db) => {
    const claimed = await db.transaction.updateMany({
      where: { id: txId, status: 'PENDING' },
      data: {
        status: decision === 'approve' ? 'COMPLETED' : 'REJECTED',
        adminNote: note || null,
        reviewerId: admin.id,
        reviewedAt: new Date(),
        completedAt: new Date(),
        ...(brokerRef ? { brokerRef } : {}),
      },
    })
    if (claimed.count !== 1) throw new ApiError(409, 'Withdrawal was already reviewed')
    if (decision === 'reject') {
      await db.account.update({ where: { userId: existing.userId }, data: { cashBalance: { increment: existing.amount } } })
    }
    if (note) {
      await db.adminNote.create({ data: { authorId: admin.id, subjectId: existing.userId, context: 'withdrawal', contextId: txId, body: note } })
    }
    await db.notification.create({
      data: {
        userId: existing.userId,
        title: decision === 'approve' ? 'Withdrawal approved' : 'Withdrawal rejected',
        body:
          decision === 'approve'
            ? `Your withdrawal of $${existing.amount.toFixed(2)} (${existing.reference}) was approved${existing.livemode ? ' and returned to your original payment method' : ' (simulated)'}.`
            : `Your withdrawal ${existing.reference} was rejected and $${existing.amount.toFixed(2)} was returned to your cash balance.`,
        level: decision === 'approve' ? 'success' : 'warning',
      },
    })
    return db.transaction.findUniqueOrThrow({ where: { id: txId } })
  })
  await audit({ actor: admin, action: `withdrawal.${decision === 'approve' ? 'approved' : 'rejected'}`, targetType: 'transaction', targetId: txId, metadata: { reference: existing.reference, amount: Number(existing.amount), note }, ip })
  return tx
}

export function calcFee(notional: number, trading: { feeBps: number; feeFlat: number }) {
  return round2((notional * trading.feeBps) / 10_000 + trading.feeFlat)
}

export async function placeOrder(
  user: SafeUser,
  input: { side: 'buy' | 'sell'; mode: 'amount' | 'shares'; value: number },
  ip: string,
): Promise<Transaction> {
  const settings = await assertCanTransact(user, { emailVerified: true, kyc: true })
  const broker = getBroker()
  if (broker.simulated && paymentsConfig().livemode) {
    throw new ApiError(403, 'Trading is unavailable: real funds cannot buy simulated shares. A licensed brokerage integration is required.')
  }
  const account = await ensureAccount(user.id)
  const symbol = 'TSLA'
  const quote = await broker.getQuote(symbol)
  const holding = await prisma.holding.findUnique({ where: { accountId_symbol: { accountId: account.id, symbol } } })
  const held = Number(holding?.shares ?? 0)

  // Pre-validate with the current quote so users get clear messages.
  let quantity: number | undefined
  let notional: number | undefined
  if (input.mode === 'shares') {
    quantity = input.value
    if (input.side === 'sell' && quantity > held + 1e-9) throw new ApiError(422, 'You cannot sell more shares than you hold', { value: 'Exceeds shares held' })
  } else {
    notional = input.value
    if (input.side === 'sell') {
      quantity = Math.min(held, Math.floor((notional / quote.price) * 1e6) / 1e6)
      if (notional > held * quote.price + 0.01) throw new ApiError(422, 'Amount exceeds the value of your shares', { value: 'Exceeds holding value' })
      notional = undefined
    }
  }
  const estNotional = notional ?? (quantity ?? 0) * quote.price
  if (estNotional < settings.trading.minOrder) throw new ApiError(422, `Minimum order is $${settings.trading.minOrder}`, { value: `Minimum order is $${settings.trading.minOrder}` })
  if (input.side === 'sell' && held <= 0) throw new ApiError(422, 'You have no TSLA shares to sell')

  const reference = makeReference(input.side === 'buy' ? 'BUY' : 'SEL')
  const fill = await broker.placeMarketOrder({ accountNumber: account.accountNumber, symbol, side: input.side, notional, quantity, reference })
  const gross = round2(fill.filledQuantity * fill.filledPrice)
  const fee = calcFee(gross, settings.trading)

  const tx = await prisma.$transaction(async (db) => {
    if (input.side === 'buy') {
      const total = D(gross + fee)
      const debited = await db.account.updateMany({ where: { id: account.id, cashBalance: { gte: total } }, data: { cashBalance: { decrement: total } } })
      if (debited.count !== 1) throw new ApiError(422, `Insufficient cash. This order needs $${(gross + fee).toFixed(2)} including fees.`, { value: 'Insufficient cash' })
      await db.holding.upsert({
        where: { accountId_symbol: { accountId: account.id, symbol } },
        create: { accountId: account.id, symbol, shares: D(fill.filledQuantity, 6), costBasis: D(gross + fee) },
        update: { shares: { increment: D(fill.filledQuantity, 6) }, costBasis: { increment: D(gross + fee) } },
      })
    } else {
      const qty = D(fill.filledQuantity, 6)
      const h = await db.holding.findUnique({ where: { accountId_symbol: { accountId: account.id, symbol } } })
      if (!h || h.shares.lt(qty)) throw new ApiError(422, 'Insufficient shares', { value: 'Exceeds shares held' })
      const remaining = h.shares.minus(qty)
      const costRemoved = remaining.isZero() ? h.costBasis : h.costBasis.mul(qty).div(h.shares).toDecimalPlaces(2)
      const dec = await db.holding.updateMany({
        where: { id: h.id, shares: { gte: qty } },
        data: { shares: { decrement: qty }, costBasis: { decrement: costRemoved } },
      })
      if (dec.count !== 1) throw new ApiError(409, 'Holding changed, please retry')
      const proceeds = round2(gross - fee)
      if (proceeds < 0) throw new ApiError(422, 'Order too small to cover fees')
      await db.account.update({ where: { id: account.id }, data: { cashBalance: { increment: D(proceeds) } } })
    }
    return db.transaction.create({
      data: {
        reference,
        userId: user.id,
        type: input.side === 'buy' ? 'BUY' : 'SELL',
        status: 'COMPLETED',
        symbol,
        amount: D(gross),
        fee: D(fee),
        shares: D(fill.filledQuantity, 6),
        price: D(fill.filledPrice, 4),
        brokerRef: fill.brokerRef,
        brokerMode: broker.mode,
        completedAt: new Date(),
      },
    })
  })
  await audit({ actor: user, action: `order.${input.side}`, targetType: 'transaction', targetId: tx.id, metadata: { reference, shares: fill.filledQuantity, price: fill.filledPrice, fee }, ip })
  return tx
}
