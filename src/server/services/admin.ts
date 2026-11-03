import 'server-only'
import type { KycStatus, Prisma, TxStatus, TxType } from '@prisma/client'
import { prisma } from '@/server/db'
import { getBroker } from '@/server/broker'
import { sweepDeposits } from '@/server/payments/service'
import { toTxDTO } from './portfolio'

const n = (v: unknown) => Number(v ?? 0)

export async function getOverviewMetrics() {
  await sweepDeposits()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
  const [customers, active, suspended, flagged, recentLogins, pendingKyc, pendingWithdrawals, sums, holdings, quote] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'CUSTOMER', status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'CUSTOMER', status: 'SUSPENDED' } }),
    prisma.user.count({ where: { role: 'CUSTOMER', flagged: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER', lastLoginAt: { gte: thirtyDaysAgo } } }),
    prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
    prisma.transaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'PENDING' }, _count: true, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ['type'], where: { status: 'COMPLETED' }, _sum: { amount: true, fee: true }, _count: true }),
    prisma.holding.aggregate({ _sum: { shares: true, costBasis: true } }),
    getBroker().getQuote('TSLA'),
  ])
  const t = (type: TxType) => sums.find((s) => s.type === type)
  const cash = await prisma.account.aggregate({ _sum: { cashBalance: true } })
  return {
    customers,
    active,
    suspended,
    flagged,
    recentLogins,
    pendingKyc,
    pendingWithdrawals: pendingWithdrawals._count,
    pendingWithdrawalAmount: n(pendingWithdrawals._sum.amount),
    totalDeposits: n(t('DEPOSIT')?._sum.amount),
    totalWithdrawals: n(t('WITHDRAWAL')?._sum.amount),
    totalInvested: n(holdings._sum.costBasis),
    sharesHeld: n(holdings._sum.shares),
    holdingsValue: n(holdings._sum.shares) * quote.price,
    tradingVolume: n(t('BUY')?._sum.amount) + n(t('SELL')?._sum.amount),
    tradeCount: (t('BUY')?._count ?? 0) + (t('SELL')?._count ?? 0),
    feesCollected: n(t('BUY')?._sum.fee) + n(t('SELL')?._sum.fee),
    cashHeld: n(cash._sum.cashBalance),
    quote,
  }
}

/** Daily simulated deposits and trading volume for the last N days. */
export async function getActivitySeries(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await prisma.$queryRaw<{ day: Date; type: TxType; total: number }[]>`
    SELECT date_trunc('day', "createdAt") AS day, "type", SUM("amount")::float AS total
    FROM "Transaction" WHERE "createdAt" >= ${since} AND "status" = 'COMPLETED'
    GROUP BY 1, 2 ORDER BY 1`
  const map = new Map<string, { day: string; deposits: number; withdrawals: number; volume: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    map.set(d, { day: d, deposits: 0, withdrawals: 0, volume: 0 })
  }
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10)
    const row = map.get(key)
    if (!row) continue
    if (r.type === 'DEPOSIT') row.deposits += r.total
    else if (r.type === 'WITHDRAWAL') row.withdrawals += r.total
    else row.volume += r.total
  }
  return [...map.values()]
}

export type CustomerFilters = { q?: string; status?: string; kyc?: string; flagged?: string; page?: number }
const PAGE = 15

export async function listCustomers(f: CustomerFilters) {
  const where: Prisma.UserWhereInput = { role: 'CUSTOMER' }
  if (f.q) {
    const q = f.q.trim().slice(0, 80)
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { account: { accountNumber: { contains: q, mode: 'insensitive' } } },
    ]
  }
  if (f.status === 'ACTIVE' || f.status === 'SUSPENDED') where.status = f.status
  if (f.kyc && ['NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED'].includes(f.kyc)) where.kyc = { status: f.kyc as KycStatus }
  if (f.flagged === '1') where.flagged = true
  const page = Math.max(1, f.page ?? 1)
  const [total, users, quote] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { account: { include: { holdings: true } }, kyc: { select: { status: true } } },
    }),
    getBroker().getQuote('TSLA'),
  ])
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    rows: users.map((u) => {
      const shares = n(u.account?.holdings.find((h) => h.symbol === 'TSLA')?.shares)
      const cash = n(u.account?.cashBalance)
      return {
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        accountNumber: u.account?.accountNumber ?? '—',
        status: u.status,
        flagged: u.flagged,
        kyc: u.kyc?.status ?? 'NOT_STARTED',
        emailVerified: !!u.emailVerifiedAt,
        cash,
        shares,
        totalValue: cash + shares * quote.price,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        isSeed: u.isSeed,
      }
    }),
  }
}

export async function getCustomerDetail(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    include: {
      account: { include: { holdings: true } },
      kyc: { include: { reviewer: { select: { email: true } } } },
      notesAbout: { orderBy: { createdAt: 'desc' }, include: { author: { select: { email: true, firstName: true } } }, take: 50 },
      sessions: { orderBy: { lastSeenAt: 'desc' }, take: 10 },
    },
  })
  if (!user) return null
  await sweepDeposits(id)
  const [transactions, activity] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.auditLog.findMany({
      where: { OR: [{ actorId: id }, { targetType: 'user', targetId: id }] },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
  ])
   
  const { passwordHash, totpSecret, ...safe } = user
  return { user: safe, transactions: transactions.map(toTxDTO), activity }
}

export async function listKyc(status: KycStatus | 'ALL') {
  return prisma.kycSubmission.findMany({
    where: status === 'ALL' ? { status: { not: 'NOT_STARTED' } } : { status },
    orderBy: [{ submittedAt: 'desc' }],
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, isSeed: true } }, reviewer: { select: { email: true } } },
    take: 200,
  })
}

export type TxFilters = { q?: string; type?: string; status?: string; from?: string; to?: string; page?: number; seed?: string }

export function txWhere(f: TxFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {}
  if (f.type && ['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL'].includes(f.type)) where.type = f.type as TxType
  if (f.status && ['PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(f.status)) where.status = f.status as TxStatus
  const created: Prisma.DateTimeFilter = {}
  if (f.from && !isNaN(Date.parse(f.from))) created.gte = new Date(f.from)
  if (f.to && !isNaN(Date.parse(f.to))) created.lte = new Date(new Date(f.to).getTime() + 86_399_999)
  if (created.gte || created.lte) where.createdAt = created
  if (f.q) {
    const q = f.q.trim().slice(0, 80)
    where.OR = [
      { reference: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { lastName: { contains: q, mode: 'insensitive' } } },
    ]
  }
  return where
}

export async function listTransactions(f: TxFilters, pageSize = 20) {
  await sweepDeposits()
  const where = txWhere(f)
  const page = Math.max(1, f.page ?? 1)
  const [total, rows, agg] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, reviewer: { select: { email: true } } },
    }),
    prisma.transaction.aggregate({ where, _sum: { amount: true, fee: true } }),
  ])
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    sumAmount: n(agg._sum.amount),
    sumFees: n(agg._sum.fee),
    rows: rows.map((r) => ({ ...toTxDTO(r), user: r.user, reviewerEmail: r.reviewer?.email ?? null })),
  }
}

export async function listAudit(f: { q?: string; action?: string; page?: number }) {
  const where: Prisma.AuditLogWhereInput = {}
  if (f.action) where.action = { startsWith: f.action.slice(0, 40) }
  if (f.q) {
    const q = f.q.trim().slice(0, 80)
    where.OR = [{ actorEmail: { contains: q, mode: 'insensitive' } }, { targetId: q }, { action: { contains: q, mode: 'insensitive' } }]
  }
  const page = Math.max(1, f.page ?? 1)
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30 }),
  ])
  return { total, page, pages: Math.max(1, Math.ceil(total / 30)), rows }
}
