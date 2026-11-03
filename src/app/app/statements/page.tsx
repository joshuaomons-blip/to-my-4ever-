import type { Metadata } from 'next'
import { requireCustomerPage } from '@/server/auth/session'
import { getPortfolio } from '@/server/services/portfolio'
import { Card, PageHeader, SimBadge } from '@/components/ui'
import { StatementForm } from '@/components/app/statement-form'
import { pct, sharesFmt, signedUsd, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Statements' }

export default async function StatementsPage() {
  const user = await requireCustomerPage()
  const p = await getPortfolio(user.id)
  return (
    <>
      <PageHeader eyebrow="Documents" title="Statements" description="Generate downloadable PDF statements for any period. Every page is watermarked as a sandbox document." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8"><StatementForm since={user.createdAt.toISOString().slice(0, 10)} /></Card>
        <Card className="h-fit p-6">
          <div className="mb-4 flex items-center justify-between"><p className="eyebrow">Portfolio summary</p><SimBadge>Live</SimBadge></div>
          <dl className="divide-y divide-white/[0.05] text-sm">
            {[
              ['Account', p.accountNumber],
              ['Total value', usdFmt(p.totalValue)],
              ['Cash', usdFmt(p.cash)],
              ['TSLA shares', sharesFmt(p.shares)],
              ['Market value', usdFmt(p.marketValue)],
              ['Net deposits', usdFmt(p.netContributions)],
              ['Total P/L', `${signedUsd(p.totalPnl)} (${pct(p.totalPnlPct)})`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5"><dt className="text-mute">{k}</dt><dd className="num">{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  )
}
