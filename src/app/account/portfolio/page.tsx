import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getPortfolio, toTxDTO } from '@/server/services/portfolio'
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, SimBadge, Table, td, th } from '@/components/ui'
import { PriceChartCard } from '@/components/charts'
import { TxTable } from '@/components/app/tx-table'
import { cn, pct, sharesFmt, signedUsd, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Portfolio' }

export default async function PortfolioPage() {
  const user = await requireCustomerPage()
  const p = await getPortfolio(user.id)
  const orders = await prisma.transaction.findMany({ where: { userId: user.id, type: { in: ['BUY', 'SELL'] } }, orderBy: { createdAt: 'desc' }, take: 50 })
  const total = p.totalValue || 1
  const parts = [
    { label: 'TSLA (simulated)', value: p.marketValue, color: '#15171a' },
    { label: 'Cash', value: p.cash, color: '#2a78d6' },
  ]
  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Your holdings, allocation and performance. TSLA positions are simulated; cash reflects your confirmed deposits."
        actions={<ButtonLink href="/account/trade">Trade TSLA</ButtonLink>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Holdings" />
          <Table>
            <thead className="border-b border-hairline">
              <tr>
                <th className={th}>Holding</th>
                <th className={cn(th, 'text-right')}>Quantity</th>
                <th className={cn(th, 'text-right')}>Price</th>
                <th className={cn(th, 'text-right')}>Average cost</th>
                <th className={cn(th, 'text-right')}>Market value</th>
                <th className={cn(th, 'text-right')}>Unrealised gain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr>
                <td className={td}>
                  <p className="font-medium">TSLA</p>
                  <p className="text-[13px] text-muted">Tesla, Inc. <SimBadge className="ml-1">Simulated</SimBadge></p>
                </td>
                <td className={cn(td, 'num text-right')}>{sharesFmt(p.shares)}</td>
                <td className={cn(td, 'num text-right')}>{usdFmt(p.quote.price)}</td>
                <td className={cn(td, 'num text-right')}>{p.shares ? usdFmt(p.avgCost) : '—'}</td>
                <td className={cn(td, 'num text-right font-medium')}>{usdFmt(p.marketValue)}</td>
                <td className={cn(td, 'num text-right', p.unrealizedPnl >= 0 ? 'text-gain' : 'text-loss')}>{p.shares ? `${signedUsd(p.unrealizedPnl)} (${pct(p.unrealizedPnlPct)})` : '—'}</td>
              </tr>
              <tr>
                <td className={td}>
                  <p className="font-medium">Cash</p>
                  <p className="text-[13px] text-muted">US dollars</p>
                </td>
                <td className={cn(td, 'text-right text-muted')}>—</td>
                <td className={cn(td, 'text-right text-muted')}>—</td>
                <td className={cn(td, 'text-right text-muted')}>—</td>
                <td className={cn(td, 'num text-right font-medium')}>{usdFmt(p.cash)}</td>
                <td className={cn(td, 'text-right text-muted')}>—</td>
              </tr>
            </tbody>
            <tfoot className="border-t border-hairline">
              <tr>
                <td className={cn(td, 'font-semibold')} colSpan={4}>Total</td>
                <td className={cn(td, 'num text-right font-semibold')}>{usdFmt(p.totalValue)}</td>
                <td className={cn(td, 'num text-right', p.totalPnl >= 0 ? 'text-gain' : 'text-loss')}>{signedUsd(p.totalPnl)} total return</td>
              </tr>
            </tfoot>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Allocation" />
          <div className="p-5 sm:p-6">
            {p.totalValue <= 0 ? (
              <p className="text-sm text-muted">Allocation appears once you have funds in your account.</p>
            ) : (
              <>
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((x) => `${x.label} ${((x.value / total) * 100).toFixed(1)}%`).join(', ')}>
                  {parts.filter((x) => x.value > 0).map((x) => (
                    <span key={x.label} style={{ width: `${(x.value / total) * 100}%`, background: x.color }} className="first:rounded-l-full last:rounded-r-full" />
                  ))}
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  {parts.map((x) => (
                    <div key={x.label} className="flex items-center gap-2.5">
                      <span className="size-2.5 rounded-[3px]" style={{ background: x.color }} />
                      <dt className="flex-1 text-fg-2">{x.label}</dt>
                      <dd className="num w-16 text-right text-muted">{((x.value / total) * 100).toFixed(1)}%</dd>
                      <dd className="num w-28 text-right">{usdFmt(x.value)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <dl className="mt-6 space-y-2 border-t border-hairline pt-4 text-sm">
              {[
                ['Net deposits', usdFmt(p.netContributions)],
                ['Cost basis', usdFmt(p.costBasis)],
                ['Orders placed', String(p.tradeCount)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <PriceChartCard kind="portfolio" defaultRange="1Y" height={320} title={<h2 className="text-[15px] font-semibold">Performance</h2>} emptyHint="Performance appears after your first deposit." />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Order history" subtitle="Simulated buy and sell orders" />
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" description="Your simulated TSLA orders will appear here." action={<ButtonLink href="/account/trade" size="sm">Place an order</ButtonLink>} />
        ) : (
          <TxTable rows={orders.map(toTxDTO)} hrefBase="/account/transactions" />
        )}
      </Card>
    </>
  )
}
