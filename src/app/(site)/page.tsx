import Link from 'next/link'
import {
  ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, ChartCandlestick, FileText, Gauge, Landmark, LineChart, Lock, ShieldCheck, Sparkles, UserPlus, Wallet,
} from 'lucide-react'
import { prisma } from '@/server/db'
import { getSettings } from '@/server/settings'
import { getBroker } from '@/server/broker'
import { ButtonLink, Card, SimBadge } from '@/components/ui'
import { LiveQuote } from '@/components/live-quote'
import { PriceChartCard } from '@/components/charts'
import { AnnouncementBar } from '@/components/site/announcements'
import { cn, pct, usdCompact, usdFmt } from '@/lib/format'

const STEPS = [
  { icon: UserPlus, title: 'Create an account', body: 'Register with email and a strong password. Sessions are secured server-side.' },
  { icon: BadgeCheck, title: 'Verify your identity', body: 'Practise a KYC flow. Sandbox only, with no ID numbers or documents collected.' },
  { icon: Wallet, title: 'Fund with virtual cash', body: 'Simulated ACH, wire or card deposits settle after a short clearing delay.' },
  { icon: ChartCandlestick, title: 'Buy fractional TSLA', body: 'Invest by dollar amount or share count, with confirmations and receipts.' },
  { icon: Landmark, title: 'Sell & withdraw', body: 'Sell any portion, then request a simulated withdrawal that is reviewed by an admin.' },
  { icon: FileText, title: 'Statements', body: 'Download PDF portfolio summaries and transaction reports at any time.' },
]

const LESSONS = [
  { href: '/learn#basics', icon: BookOpen, title: 'How stock investing works', body: 'Shares, exchanges, orders and what really drives price.' },
  { href: '/learn#risk', icon: Gauge, title: 'Risk & volatility', body: 'Why TSLA moves more than the market, and how to size positions.' },
  { href: '/learn#horizon', icon: LineChart, title: 'Long vs. short term', body: 'Compounding, timing risk and the cost of overtrading.' },
]

export default async function Home() {
  const [settings, quote, announcements, faqs] = await Promise.all([
    getSettings(),
    getBroker().getQuote('TSLA'),
    prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 2 }),
    prisma.faq.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, take: 4 }),
  ])
  const { homepage, appearance, investmentInfo } = settings
  const words = homepage.heroHeadline.split(' ')
  const split = Math.ceil(words.length / 2)

  return (
    <>
      {/* ─── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className={cn('pointer-events-none absolute inset-0', appearance.heroStyle === 'grid' && 'grid-bg [mask-image:radial-gradient(ellipse_at_50%_0%,black_20%,transparent_70%)]')} />
        {appearance.heroStyle !== 'minimal' && (
          <>
            <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-accent/[0.13] blur-[120px]" />
            {appearance.heroStyle === 'aurora' && <div className="pointer-events-none absolute top-20 -right-40 h-[420px] w-[620px] rounded-full bg-sky-500/[0.08] blur-[120px]" />}
          </>
        )}
        <div className="relative mx-auto max-w-7xl px-5 pt-14 pb-20 sm:px-8 sm:pt-20 lg:pt-24">
          {announcements.length > 0 && <div className="mb-10 max-w-3xl"><AnnouncementBar items={announcements} /></div>}
          <div className="grid items-center gap-14 lg:grid-cols-[1.08fr_1fr]">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-silver">
                <Sparkles className="size-3.5 text-accent" /> {homepage.heroEyebrow}
              </span>
              <h1 className="mt-7 font-display text-[44px] leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[76px]">
                {words.slice(0, split).join(' ')}{' '}
                <span className="bg-gradient-to-r from-white via-silver to-white/50 bg-clip-text text-transparent">{words.slice(split).join(' ')}</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-mute sm:text-lg">{homepage.heroSubtext}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/register" size="lg">{homepage.primaryCta} <ArrowRight className="size-4" /></ButtonLink>
                <ButtonLink href="/markets" size="lg" variant="ghost">{homepage.secondaryCta}</ButtonLink>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-dim">
                <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-silver" /> Virtual funds only</span>
                <span className="flex items-center gap-2"><Lock className="size-4 text-silver" /> No bank or card details stored</span>
                <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-silver" /> Independent platform</span>
              </div>
            </div>

            <div className="relative animate-fade-up [animation-delay:120ms]">
              <div className="absolute -inset-px rounded-[1.6rem] bg-gradient-to-b from-white/15 via-white/[0.03] to-transparent" />
              <Card className="relative overflow-hidden rounded-[1.5rem] bg-carbon/90 backdrop-blur-xl">
                <div className="flex items-start justify-between px-6 pt-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-semibold">TSLA</span>
                      <span className="text-xs text-dim">Tesla, Inc. · Nasdaq</span>
                    </div>
                    <LiveQuote initial={quote} className="mt-3" />
                  </div>
                  <SimBadge>Sample data</SimBadge>
                </div>
                <PriceChartCard defaultRange="3M" height={230} />
                <div className="grid grid-cols-3 border-t border-white/[0.06]">
                  {[
                    ['Market cap', usdCompact(quote.marketCap)],
                    ['52W range', `$${quote.week52Low.toFixed(0)}–${quote.week52High.toFixed(0)}`],
                    ['30D vol.', `${quote.volatility30d}%`],
                  ].map(([k, v], i) => (
                    <div key={k} className={cn('px-5 py-4', i > 0 && 'border-l border-white/[0.06]')}>
                      <p className="eyebrow text-[9.5px]">{k}</p>
                      <p className="num mt-1.5 text-sm text-white">{v}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Market overview ─────────────────────────────── */}
      <section className="border-y border-white/[0.06] bg-ink-2/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-5 sm:px-8 lg:grid-cols-5">
          {[
            ['Sandbox price', usdFmt(quote.price)],
            ['Day change', pct(quote.changePercent)],
            ['Day range', `${usdFmt(quote.dayLow)} – ${usdFmt(quote.dayHigh)}`],
            ['Previous close', usdFmt(quote.previousClose)],
            ['Volume (sim.)', `${(quote.volume / 1e6).toFixed(1)}M`],
          ].map(([k, v], i) => (
            <div key={k} className={cn('py-6', i % 2 === 1 && 'pl-5 lg:pl-0', i > 0 && 'lg:border-l lg:border-white/[0.06] lg:pl-6')}>
              <p className="eyebrow">{k}</p>
              <p className={cn('num mt-2 text-lg', k === 'Day change' ? (quote.changePercent >= 0 ? 'text-gain' : 'text-loss') : 'text-white')}>{v}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-7xl px-5 pb-4 text-[11px] text-dim sm:px-8">Market overview uses the simulated sandbox feed and is not real-time market data.</p>
      </section>

      {/* ─── How it works ────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow">The full brokerage journey · simulated</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-[42px] sm:leading-[1.05]">Every step of investing, rehearsed without risk.</h2>
          <p className="mt-4 text-mute">The sandbox mirrors how a regulated brokerage works, from onboarding to statements, so you can learn the process before using real money anywhere.</p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="group relative bg-ink p-7 transition-colors hover:bg-carbon/60">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-silver transition-colors group-hover:border-accent/40 group-hover:text-accent">
                  <s.icon className="size-[18px]" />
                </span>
                <span className="num text-xs text-dim">0{i + 1}</span>
              </div>
              <h3 className="mt-6 font-display text-[17px] font-medium tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Investment info + education ─────────────────── */}
      <section className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
        <Card className="overflow-hidden p-8">
          <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/10 blur-3xl" />
          <p className="eyebrow">Investment information</p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">{investmentInfo.title}</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-mute">
            {investmentInfo.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <Link href="/markets" className="mt-6 inline-flex items-center gap-1.5 text-sm text-white hover:text-accent">
            View TSLA overview <ArrowUpRight className="size-4" />
          </Link>
        </Card>
        <div className="grid gap-4">
          {LESSONS.map((l) => (
            <Link key={l.href} href={l.href} className="card group flex items-center gap-5 p-6 transition-all hover:border-white/15">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-silver group-hover:text-accent"><l.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-medium">{l.title}</h3>
                <p className="mt-1 text-sm text-mute">{l.body}</p>
              </div>
              <ArrowRight className="size-4 text-dim transition-transform group-hover:translate-x-1 group-hover:text-white" />
            </Link>
          ))}
        </div>
      </section>

      {/* ─── FAQ preview ─────────────────────────────────── */}
      {faqs.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pt-24 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em]">Questions, answered.</h2>
            <Link href="/faq" className="text-sm text-mute hover:text-white">All FAQs →</Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {faqs.map((f) => (
              <div key={f.id} className="rounded-2xl border border-white/[0.06] p-6">
                <h3 className="font-medium">{f.question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── CTA ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 pt-24 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-carbon-2 via-carbon to-ink px-8 py-14 sm:px-14">
          <div className="pointer-events-none absolute -right-20 -bottom-32 size-[420px] rounded-full bg-accent/20 blur-[100px]" />
          <div className="relative max-w-xl">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Start with $0 at risk.</h2>
            <p className="mt-3 text-mute">Open a sandbox account in under a minute and practise with virtual funds.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/register" size="lg">Open sandbox account</ButtonLink>
              <ButtonLink href="/learn" size="lg" variant="ghost">Read the basics first</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
