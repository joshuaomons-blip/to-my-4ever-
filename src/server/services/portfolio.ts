import 'server-only'
import type { Transaction } from '@prisma/client'
import { prisma } from '@/server/db'
import { getBroker, type Range } from '@/server/broker'
import { ensureAccount, round2, settleDueDeposits } from './ledger'

export type TxDTO = {
  id: string
  reference: string
  type: Transaction['type']
  status: Transaction['status']
  symbol: string | null
  amount: number
  fee: number
  shares: number | null
  price: number | null
  method: string | null
  brokerRef: string | null
  isSeed: boolean
  customerNote: string | null
  adminNote: string | null
  settlesAt: string | null
  completedAt: string | null
  reviewedAt: string | null
  createdAt: string
}

export function toTxDTO(t: Transaction): TxDTO {
  return {
    id: t.id,
    reference: t.reference,
    type: t.type,
    status: t.status,
    symbol: t.symbol,
    amount: Number(t.amount),
    fee: Number(t.fee),
    shares: t.shares == null ? null : Number(t.shares),
    price: t.price == null ? null : Number(t.price),
    method: t.method,
    brokerRef: t.brokerRef,
    isSeed: t.isSeed,
    customerNote: t.customerNote,
    adminNote: t.adminNote,
    settlesAt: t.settlesAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    reviewedAt: t.reviewedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }
}

export async function getPortfolio(userId: string) {
  await settleDueDeposits(userId)
  const account = await ensureAccount(userId)
  const [holding, quote, sums] = await Promise.all([
    prisma.holding.findUnique({ where: { accountId_symbol: { accountId: account.id, symbol: 'TSLA' } } }),
    getBroker().getQuote('TSLA'),
    prisma.transaction.groupBy({ by: ['type', 'status'], where: { userId }, _sum: { amount: true, fee: true }, _count: true }),
  ])
  const sum = (type: Transaction['type'], status: Transaction['status']) =>
    Number(sums.find((s) => s.type === type && s.status === status)?._sum.amount ?? 0)

  const cash = Number(account.cashBalance)
  const shares = Number(holding?.shares ?? 0)
  const costBasis = Number(holding?.costBasis ?? 0)
  const marketValue = round2(shares * quote.price)
  const totalValue = round2(cash + marketValue)
  const deposited = sum('DEPOSIT', 'COMPLETED')
  const withdrawn = sum('WITHDRAWAL', 'COMPLETED') + sum('WITHDRAWAL', 'PENDING')
  const netContributions = round2(deposited - withdrawn)
  const totalPnl = round2(totalValue - netContributions)
  const unrealizedPnl = round2(marketValue - costBasis)

  return {
    accountNumber: account.accountNumber,
    quote,
    cash,
    shares,
    costBasis,
    avgCost: shares > 0 ? round2(costBasis / shares) : 0,
    marketValue,
    totalValue,
    invested: costBasis,
    deposited,
    withdrawn,
    pendingDeposits: sum('DEPOSIT', 'PENDING'),
    pendingWithdrawals: sum('WITHDRAWAL', 'PENDING'),
    netContributions,
    totalPnl,
    totalPnlPct: netContributions > 0 ? round2((totalPnl / netContributions) * 100) : 0,
    unrealizedPnl,
    unrealizedPnlPct: costBasis > 0 ? round2((unrealizedPnl / costBasis) * 100) : 0,
    dayChange: round2(shares * quote.change),
    tradeCount: sums.filter((s) => s.type === 'BUY' || s.type === 'SELL').reduce((a, s) => a + s._count, 0),
  }
}
export type Portfolio = Awaited<ReturnType<typeof getPortfolio>>

/** Replays the ledger against simulated prices to chart portfolio value over time. */
export async function getPortfolioHistory(userId: string, range: Range) {
  const [history, txs] = await Promise.all([
    getBroker().getHistory('TSLA', range),
    prisma.transaction.findMany({ where: { userId, status: { in: ['COMPLETED', 'PENDING'] } }, orderBy: { createdAt: 'asc' } }),
  ])
  const events = txs
    .map((t) => {
      const amount = Number(t.amount)
      const fee = Number(t.fee)
      const shares = Number(t.shares ?? 0)
      switch (t.type) {
        case 'DEPOSIT':
          return t.status === 'COMPLETED' ? { at: (t.completedAt ?? t.createdAt).getTime(), cash: amount, shares: 0 } : null
        case 'WITHDRAWAL':
          return { at: t.createdAt.getTime(), cash: -amount, shares: 0 }
        case 'BUY':
          return { at: t.createdAt.getTime(), cash: -(amount + fee), shares }
        case 'SELL':
          return { at: t.createdAt.getTime(), cash: amount - fee, shares: -shares }
      }
    })
    .filter((e): e is { at: number; cash: number; shares: number } => e !== null)
    .sort((a, b) => a.at - b.at)

  let i = 0
  let cash = 0
  let shares = 0
  return history.map((pt) => {
    while (i < events.length && events[i].at <= pt.t) {
      cash += events[i].cash
      shares += events[i].shares
      i++
    }
    return { t: pt.t, v: round2(cash + shares * pt.p), p: pt.p }
  })
}
