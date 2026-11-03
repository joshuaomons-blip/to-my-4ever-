import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, BadgeCheck, CircleCheck, CircleDashed, Clock, Mail, Receipt, Wallet } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getPortfolio, toTxDTO } from '@/server/services/portfolio'
import { ButtonLink, Card, CardHeader, EmptyState, SimBadge, Stat } from '@/components/ui'
import { PriceChartCard } from '@/components/charts'
import { LiveQuote } from '@/components/live-quote'
import { TxTable } from '@/components/app/tx-table'
import { AnnouncementBar } from '@/components/site/announcements'
import { cn, pct, sharesFmt, signedUsd, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Dashboard' }

function greeting() {
  const h = new Date().getUTCHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default async function Dashboard() {
  const user = await requireCustomerPage()
  const portfolio = await getPortfolio(user.id)
  const [recent, kyc, announcements] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } }),
    prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 2 }),
  ])
  const steps = [
    { done: !!user.emailVerifiedAt, label: 'Verify your email', href: '/dev/mailbox', icon: Mail },
    { done: kyc?.status === 'APPROVED', pending: kyc?.status === 'PENDING', label: 'Complete identity verification', href: '/app/kyc', icon: BadgeCheck },
    { done: portfolio.deposited > 0 || portfolio.pendingDeposits > 0, label: 'Deposit virtual funds', href: '/app/funding', icon: Wallet },
    { done: portfolio.tradeCount > 0, label: 'Place your first TSLA order', href: '/app/trade', icon: ArrowLeftRight },
  ]
  const onboarding = steps.some((s) => !s.done)
  const q = portfolio.quote

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <p className="eyebrow mb-2">Account {portfolio.accountNumber}</p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">{greeting()}, {user.firstName}</h1>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/app/funding" variant="ghost"><ArrowDownToLine className="size-4" /> Deposit</ButtonLink>
          <ButtonLink href="/app/trade"><ArrowLeftRight className="size-4" /> Trade TSLA</ButtonLink>
        </div>
      </div>

      {announcements.length > 0 && <AnnouncementBar items={announcements} />}

      {onboarding && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[15px] font-medium">Get started</h2>
              <p className="text-xs text-mute">{steps.filter((s) => s.done).length} of {steps.length} steps complete</p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(steps.filter((s) => s.done).length / steps.length) * 100}%` }} />
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <Link key={s.label} href={s.href} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors', s.done ? 'border-gain/15 bg-gain/[0.04] text-silver' : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.02]')}>
                {s.done ? <CircleCheck className="size-4 text-gain" /> : s.pending ? <Clock className="size-4 text-warn" /> : <CircleDashed className="size-4 text-dim" />}
                <span className={cn(s.done && 'line-through decoration-white/20')}>{s.label}</span>
                {s.pending && <span className="ml-auto text-[10px] text-warn">In review</span>}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total portfolio value" value={usdFmt(portfolio.totalValue)} sub={<>{signedUsd(portfolio.dayChange)} today <SimBadge className="ml-1 align-middle">Sim</SimBadge></>} tone={portfolio.dayChange >= 0 ? 'gain' : 'loss'} />
        <Stat label="Available cash" value={usdFmt(portfolio.cash)} sub={portfolio.pendingDeposits > 0 ? `${usdFmt(portfolio.pendingDeposits)} settling` : portfolio.pendingWithdrawals > 0 ? `${usdFmt(portfolio.pendingWithdrawals)} withdrawal pending` : 'Virtual funds'} />
        <Stat label="Total invested" value={usdFmt(portfolio.invested)} sub={`${sharesFmt(portfolio.shares, 4)} TSLA shares`} />
        <Stat label="Total profit / loss" value={signedUsd(portfolio.totalPnl)} sub={`${pct(portfolio.totalPnlPct)} on net deposits`} tone={portfolio.totalPnl >= 0 ? 'gain' : 'loss'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <PriceChartCard
            kind="portfolio"
            defaultRange="3M"
            height={300}
            title={<div className="flex items-center gap-2"><h2 className="font-display text-[15px] font-medium">Portfolio performance</h2><SimBadge>Simulated</SimBadge></div>}
            emptyHint={<span>Your simulated portfolio value will appear here after your first deposit.<br /><Link href="/app/funding" className="text-white underline">Deposit virtual funds</Link></span>}
          />
        </Card>
        <Card className="flex flex-col">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-ink font-display text-xs font-bold">T</span>
                <div>
                  <p className="text-sm font-medium">TSLA</p>
                  <p className="text-[11px] text-dim">Tesla, Inc.</p>
                </div>
              </div>
              <SimBadge>Sandbox price</SimBadge>
            </div>
            <LiveQuote initial={q} size="sm" className="mt-5" />
          </div>
          <dl className="mx-6 divide-y divide-white/[0.05] border-t border-white/[0.06] text-sm">
            {[
              ['Your shares', sharesFmt(portfolio.shares)],
              ['Average cost', portfolio.shares > 0 ? usdFmt(portfolio.avgCost) : '—'],
              ['Market value', usdFmt(portfolio.marketValue)],
              ['Unrealized P/L', portfolio.shares > 0 ? `${signedUsd(portfolio.unrealizedPnl)} (${pct(portfolio.unrealizedPnlPct)})` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-3">
                <dt className="text-mute">{k}</dt>
                <dd className={cn('num', k === 'Unrealized P/L' && portfolio.shares > 0 ? (portfolio.unrealizedPnl >= 0 ? 'text-gain' : 'text-loss') : 'text-white')}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto grid grid-cols-2 gap-2 p-6">
            <ButtonLink href="/app/trade?side=buy" variant="success">Buy</ButtonLink>
            <ButtonLink href="/app/trade?side=sell" variant="danger">Sell</ButtonLink>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent activity" subtitle="Simulated transactions" action={<Link href="/app/transactions" className="flex items-center gap-1 text-xs text-mute hover:text-white">View all <ArrowRight className="size-3.5" /></Link>} />
        <div className="mt-4">
          {recent.length === 0 ? (
            <EmptyState icon={<Receipt className="size-5" />} title="No transactions yet" description="Deposit virtual funds to start building your simulated TSLA portfolio." action={<ButtonLink href="/app/funding" size="sm">Deposit funds</ButtonLink>} />
          ) : (
            <TxTable rows={recent.map(toTxDTO)} hrefBase="/app/transactions" />
          )}
        </div>
      </Card>
    </div>
  )
}
