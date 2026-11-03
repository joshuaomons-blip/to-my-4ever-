import type { Metadata } from 'next'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { getPortfolio } from '@/server/services/portfolio'
import { getBroker } from '@/server/broker'
import { paymentsConfig } from '@/server/payments/config'
import { Card, PageHeader, SimBadge } from '@/components/ui'
import { PriceChartCard } from '@/components/charts'
import { LiveQuote } from '@/components/live-quote'
import { TradePanel } from '@/components/app/trade-panel'
import { pct, sharesFmt, signedUsd, usdCompact, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Trade TSLA' }

export default async function TradePage({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const user = await requireCustomerPage()
  const sp = await searchParams
  const [portfolio, settings, kyc] = await Promise.all([
    getPortfolio(user.id),
    getSettings(),
    prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } }),
  ])
  const q = portfolio.quote
  const blocked = paymentsConfig().livemode && getBroker().simulated
    ? { reason: 'Trading is unavailable: real funds cannot buy simulated shares. Trading will open once a licensed brokerage is connected.', href: '/account/portfolio', cta: 'View portfolio' }
    : settings.maintenance.enabled
    ? { reason: settings.maintenance.message, href: '/account', cta: 'Back to overview' }
    : !user.emailVerifiedAt
      ? { reason: 'Verify your email address before trading.', href: '/dev/mailbox', cta: 'Open test mailbox' }
      : kyc?.status !== 'APPROVED'
        ? { reason: kyc?.status === 'PENDING' ? 'Your identity verification is under review. Trading unlocks once it is approved.' : 'Complete identity verification to unlock trading.', href: '/account/kyc', cta: kyc?.status === 'PENDING' ? 'View verification status' : 'Start verification' }
        : null

  return (
    <>
      <PageHeader title="Trade TSLA" description="Buy or sell fractional TSLA shares in your simulated portfolio, priced from the simulated market feed." />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">Tesla, Inc.</h2>
                  <span className="text-sm text-muted">TSLA</span>
                  <SimBadge>Simulated price</SimBadge>
                </div>
                <LiveQuote initial={q} className="mt-3" />
              </div>
            </div>
            <PriceChartCard defaultRange="1D" height={320} />
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Day range', `${usdFmt(q.dayLow)} – ${usdFmt(q.dayHigh)}`],
              ['52W range', `${usdFmt(q.week52Low)} – ${usdFmt(q.week52High)}`],
              ['Market cap', usdCompact(q.marketCap)],
              ['30D volatility', `${q.volatility30d}%`],
            ].map(([k, v]) => (
              <Card key={k} className="p-5">
                <p className="eyebrow text-[9.5px]">{k}</p>
                <p className="num mt-2 text-sm">{v}</p>
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <p className="eyebrow mb-4">Your TSLA position · simulated</p>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                ['Shares', sharesFmt(portfolio.shares)],
                ['Avg. cost', portfolio.shares ? usdFmt(portfolio.avgCost) : '—'],
                ['Market value', usdFmt(portfolio.marketValue)],
                ['Unrealized P/L', portfolio.shares ? `${signedUsd(portfolio.unrealizedPnl)} (${pct(portfolio.unrealizedPnlPct)})` : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[11px] text-faint">{k}</p>
                  <p className={`num mt-1 text-sm ${k === 'Unrealized P/L' && portfolio.shares ? (portfolio.unrealizedPnl >= 0 ? 'text-gain' : 'text-loss') : ''}`}>{v}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card className="h-fit xl:sticky xl:top-24">
          <TradePanel initialQuote={q} cash={portfolio.cash} shares={portfolio.shares} trading={settings.trading} blocked={blocked} defaultSide={sp.side === 'sell' ? 'sell' : 'buy'} />
        </Card>
      </div>
    </>
  )
}
