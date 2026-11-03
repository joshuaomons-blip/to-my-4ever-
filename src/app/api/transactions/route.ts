import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { txWhere } from '@/server/services/admin'
import { sweepDeposits } from '@/server/payments/service'
import { toTxDTO } from '@/server/services/portfolio'

export const GET = route({ auth: 'customer' }, async ({ req, user }) => {
  await sweepDeposits(user.id)
  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const where = { ...txWhere({ type: sp.get('type') ?? undefined, status: sp.get('status') ?? undefined, q: sp.get('q') ?? undefined }), userId: user.id }
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }),
  ])
  return { total, page, pages: Math.max(1, Math.ceil(total / 25)), rows: rows.map(toTxDTO) }
})
