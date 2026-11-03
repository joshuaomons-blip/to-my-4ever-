import { route } from '@/server/http'
import { prisma } from '@/server/db'
import { txWhere } from '@/server/services/admin'
import { toCsv } from '@/server/services/statements'
import { audit } from '@/server/audit'

export const GET = route({ auth: 'admin', permission: 'transactions:export', rateLimit: { name: 'tx-export', limit: 20, windowSeconds: 300 } }, async ({ req, user, ip }) => {
  const sp = req.nextUrl.searchParams
  const get = (k: string) => sp.get(k) ?? undefined
  const filters = { q: get('q'), type: get('type'), status: get('status'), from: get('from'), to: get('to') }
  const rows = await prisma.transaction.findMany({
    where: txWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: 50_000,
    include: { user: { select: { email: true, firstName: true, lastName: true } }, reviewer: { select: { email: true } } },
  })
  const csv = toCsv(
    rows.map((r) => ({
      environment: 'SANDBOX (simulated)',
      reference: r.reference,
      created_at: r.createdAt.toISOString(),
      completed_at: r.completedAt?.toISOString() ?? '',
      customer_email: r.user.email,
      customer_name: `${r.user.firstName} ${r.user.lastName}`,
      type: r.type,
      status: r.status,
      symbol: r.symbol ?? '',
      shares: r.shares?.toString() ?? '',
      price: r.price?.toString() ?? '',
      amount_usd: r.amount.toString(),
      fee_usd: r.fee.toString(),
      method: r.method ?? '',
      broker_ref: r.brokerRef ?? '',
      reviewed_by: r.reviewer?.email ?? '',
      admin_note: r.adminNote ?? '',
      demo_seed: r.isSeed ? 'yes' : 'no',
    })),
  )
  await audit({ actor: user, action: 'transactions.exported', metadata: { filters, rows: rows.length }, ip })
  return new Response(csv || 'no transactions match these filters\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sandbox-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})
