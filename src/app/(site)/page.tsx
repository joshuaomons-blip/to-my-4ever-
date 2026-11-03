import Link from 'next/link'
import { ArrowUpRight, Landmark, LockKeyhole, ShieldCheck } from 'lucide-react'
import { prisma } from '@/server/db'
import { getSettings } from '@/server/settings'
import { getBroker } from '@/server/broker'
import { paymentsConfig } from '@/server/payments/config'
import { ButtonLink } from '@/components/ui'
import { LiveQuote } from '@/components/live-quote'
import { AnnouncementBar } from '@/components/site/announcements'
import { cn, pct, usdCompact, usdFmt } from '@/lib/format'

const STEPS = [
  { title: 'Open an account', body: 'Register with your email and a strong password. Two-factor sign-in is available from day one.' },
  { title: 'Verify your identity', body: 'Confirm who you are before money can move. Your details are reviewed by our team.' },
  { title: 'Add funds', body: 'Pay by bank transfer or card through our payment provider. Your balance updates only after the provider confirms the payment.' },
  { title: 'Practise with TSLA', body: 'Place fractional buy and sell orders against a simulated TSLA price and follow your portfolio over time.' },
  { title: 'Withdraw and report', body: 'Request a withdrawal for review and download PDF statements whenever you need them.' },
]

/** Builds a smooth SVG path for the hero price line from server-side history. */
function linePath(points: { t: number; p: number }[], w: number, h: number) {
  const ps = points.map((x) => x.p)
  const lo = Math.min(...ps)
  const hi = Math.max(...ps)
  const t0 = points[0].t
  const t1 = points.at(-1)!.t
  const xy = points.map((pt) => [((pt.t - t0) / (t1 - t0)) * w, h - 8 - ((pt.p - lo) / (hi - lo || 1)) * (h - 16)])
  return { d: 'M' + xy.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'), end: xy.at(-1)!, lo, hi }
}

export default async function Home() {
  const [settings, quote, history, announcements, faqs] = await Promise.all([
    getSettings(),
    getBroker().getQuote('TSLA'),
    getBroker().getHistory('TSLA', '1Y'),
    prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 2 }),
    prisma.faq.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, take: 4 }),
  ])
  const { homepage, investmentInfo } = settings
  const live = paymentsConfig().livemode
  const W = 1200
  const H = 260
  const line = linePath(history, W, H)
  const yearChange = ((quote.price - history[0].p) / history[0].p) * 100

  return (
    <>
      {/* ─── Hero: the price line is the image ─────────────── */}
      <section
        className={cn(
          'border-b border-hairline',
          settings.appearance.heroStyle === 'aurora' ? 'bg-canvas' : 'bg-surface',
          settings.appearance.heroStyle === 'grid' && 'bg-[linear-gradient(#f0f1f3_1px,transparent_1px),linear-gradient(90deg,#f0f1f3_1px,transparent_1px)] bg-[size:48px_48px]',
        )}
      >
        <div className="mx-auto max-w-7xl px-5 pt-14 sm:px-8 sm:pt-20">
          {announcements.length > 0 && <div className="mb-10 max-w-3xl"><AnnouncementBar items={announcements} /></div>}
          <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-end">
            <div>
              <p className="text-[15px] font-medium text-accent">{homepage.heroEyebrow}</p>
              <h1 className="display mt-4 max-w-3xl text-[44px] leading-[1.02] font-semibold text-fg sm:text-[64px] lg:text-[76px]" style={{ fontVariationSettings: "'wdth' 118" }}>
                {homepage.heroHeadline}
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-fg-2">{homepage.heroSubtext}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/register" size="lg">{homepage.primaryCta}</ButtonLink>
                <ButtonLink href="/markets" size="lg" variant="ghost">{homepage.secondaryCta}</ButtonLink>
              </div>
            </div>
            <div className="lg:justify-self-end lg:text-right">
              <p className="text-[15px] text-muted">Tesla, Inc. (TSLA), simulated price</p>
              <LiveQuote initial={quote} className="mt-1 [&>div]:lg:justify-end" />
            </div>
          </div>
        </div>
        <figure className="relative mx-auto mt-10 max-w-7xl px-5 sm:px-8" aria-label={`Simulated TSLA price over the past year, from ${usdFmt(history[0].p)} to ${usdFmt(quote.price)}`}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[180px] w-full sm:h-[260px]" aria-hidden>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#eceef0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={`${line.d} L${W} ${H} L0 ${H} Z`} fill="var(--color-accent)" opacity="0.05" />
            <path d={line.d} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset="1" className="animate-draw" />
          </svg>
          <figcaption className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-hairline py-3 text-[13px] text-muted">
            <span>Past 12 months, simulated</span>
            <span className="num">
              Low {usdFmt(line.lo)} · High {usdFmt(line.hi)} ·{' '}
              <span className={yearChange >= 0 ? 'text-gain' : 'text-loss'}>{pct(yearChange)} over the year</span>
            </span>
          </figcaption>
        </figure>
      </section>

      {/* ─── Market overview ─────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 pt-16 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-2xl font-semibold">Market overview</h2>
          <Link href="/markets" className="text-sm text-muted hover:text-fg">Full TSLA overview</Link>
        </div>
        <dl className="mt-5 grid grid-cols-2 border-t border-l border-hairline bg-surface sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Price', usdFmt(quote.price)],
            ['Day change', pct(quote.changePercent)],
            ['Day range', `${quote.dayLow.toFixed(2)}–${quote.dayHigh.toFixed(2)}`],
            ['52-week range', `${quote.week52Low.toFixed(0)}–${quote.week52High.toFixed(0)}`],
            ['Market value', usdCompact(quote.marketCap)],
            ['30-day volatility', `${quote.volatility30d}%`],
          ].map(([k, v]) => (
            <div key={k} className="border-r border-b border-hairline px-5 py-4">
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className={cn('num mt-1 text-[17px] font-semibold', k === 'Day change' ? (quote.changePercent >= 0 ? 'text-gain' : 'text-loss') : 'text-fg')}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[13px] text-faint">Prices come from a simulated feed and are not real-time market data.</p>
      </section>

      {/* ─── How it works (a real sequence, so it is numbered) ─ */}
      <section className="mx-auto max-w-7xl px-5 pt-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="display text-3xl leading-tight font-semibold">How your account works</h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">The same steps as a regulated brokerage account, in the order you will meet them.</p>
          </div>
          <ol className="divide-y divide-hairline border-y border-hairline">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4 py-5 sm:grid-cols-[2.5rem_14rem_1fr]">
                <span className="num pt-0.5 text-[15px] font-semibold text-accent">{i + 1}</span>
                <h3 className="text-[16px] font-semibold">{s.title}</h3>
                <p className="col-start-2 text-[15px] leading-relaxed text-muted sm:col-start-3">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── Trust: how money is handled ─────────────────── */}
      <section className="mx-auto max-w-7xl px-5 pt-20 sm:px-8">
        <div className="card grid gap-8 p-8 md:grid-cols-3 md:p-10">
          {[
            [Landmark, 'Payments through a regulated provider', 'Bank transfers and cards are processed by the payment provider, never by our servers. We never see or store card numbers or bank logins.'],
            [ShieldCheck, 'Credited only when confirmed', 'Your balance changes only after the provider’s signed notification is verified and the payment is re-checked with the provider directly. Receipts and screenshots are never accepted as proof.'],
            [LockKeyhole, 'Every action recorded', 'Sign-ins, payments, withdrawals and every administrator decision are written to a permanent audit log.'],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Landmark
            return (
              <div key={title as string}>
                <I className="size-5 text-fg" />
                <h3 className="mt-4 text-[16px] font-semibold">{title as string}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{body as string}</p>
              </div>
            )
          })}
          <p className="text-[13px] text-muted md:col-span-3">
            {live
              ? 'Live payments are enabled. TSLA holdings and orders remain simulated until a licensed brokerage is connected.'
              : 'The platform is currently in test mode: payments run through a test provider and no real money moves.'}
          </p>
        </div>
      </section>

      {/* ─── Investment information ──────────────────────── */}
      <section className="mx-auto grid max-w-7xl gap-10 px-5 pt-20 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="display text-3xl font-semibold">{investmentInfo.title}</h2>
          <div className="mt-4 max-w-2xl space-y-3 text-[16px] leading-relaxed text-fg-2">
            {investmentInfo.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
        <nav aria-label="Learn" className="self-start border-t border-hairline">
          {[
            ['/learn#basics', 'How stock investing works'],
            ['/learn#risk', 'Risk management'],
            ['/learn#volatility', 'Market volatility'],
            ['/learn#horizon', 'Long-term and short-term investing'],
            ['/markets', 'TSLA company overview and statistics'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="group flex items-center justify-between border-b border-hairline py-4 text-[16px] text-fg hover:text-accent">
              {label}
              <ArrowUpRight className="size-4 text-faint group-hover:text-accent" />
            </Link>
          ))}
        </nav>
      </section>

      {/* ─── FAQ preview ─────────────────────────────────── */}
      {faqs.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pt-20 sm:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="display text-3xl font-semibold">Common questions</h2>
            <Link href="/faq" className="text-sm text-muted hover:text-fg">All questions</Link>
          </div>
          <dl className="mt-6 grid gap-x-12 border-t border-hairline md:grid-cols-2">
            {faqs.map((f) => (
              <div key={f.id} className="border-b border-hairline py-5">
                <dt className="font-semibold">{f.question}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-muted">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ─── Closing call to action ──────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 pt-20 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[10px] bg-fg px-8 py-10 text-white sm:flex-row sm:items-center sm:px-12">
          <div>
            <h2 className="display text-2xl font-semibold sm:text-3xl">Open your account in a few minutes.</h2>
            <p className="mt-2 text-[15px] text-white/70">Registration, email confirmation and identity verification all happen online.</p>
          </div>
          <div className="flex gap-3">
            <ButtonLink href="/register" size="lg">Open an account</ButtonLink>
            <ButtonLink href="/about" size="lg" variant="ghost" className="border-white/25 bg-transparent text-white hover:bg-white/10">About us</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
