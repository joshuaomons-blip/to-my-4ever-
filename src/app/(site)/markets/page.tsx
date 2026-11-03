import type { Metadata } from 'next'
import { Activity, Building2, Factory, Gauge, TriangleAlert, Zap } from 'lucide-react'
import { getBroker } from '@/server/broker'
import { getCurrentUser } from '@/server/auth/session'
import { ButtonLink, Card, CardHeader, SimBadge } from '@/components/ui'
import { LiveQuote } from '@/components/live-quote'
import { PriceChartCard } from '@/components/charts'
import { usdCompact, usdFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'TSLA overview' }

// Illustrative figures for education. Clearly labeled; not sourced from filings in real time.
const FINANCIALS = [
  ['Revenue (TTM)', '$97.7B'],
  ['Gross margin', '17.9%'],
  ['Operating margin', '7.2%'],
  ['P/E ratio', '182.4'],
  ['EPS (TTM)', '$1.80'],
  ['Free cash flow', '$3.6B'],
  ['Beta (5Y)', '2.31'],
  ['Dividend', 'None'],
]

export default async function MarketsPage() {
  const [quote, user] = await Promise.all([getBroker().getQuote('TSLA'), getCurrentUser('customer')])
  const metrics = [
    ['Open', usdFmt(quote.open)],
    ['Previous close', usdFmt(quote.previousClose)],
    ['Day high', usdFmt(quote.dayHigh)],
    ['Day low', usdFmt(quote.dayLow)],
    ['52-week high', usdFmt(quote.week52High)],
    ['52-week low', usdFmt(quote.week52Low)],
    ['Market cap', usdCompact(quote.marketCap)],
    ['Volume', `${(quote.volume / 1e6).toFixed(2)}M`],
  ]
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="animate-fade-up">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-carbon font-display text-sm font-bold">T</span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Tesla, Inc. <span className="text-mute">(TSLA)</span></h1>
              <p className="text-xs text-dim">Nasdaq · USD · Consumer cyclical / Auto manufacturers</p>
            </div>
            <SimBadge>Sandbox feed</SimBadge>
          </div>
          <LiveQuote initial={quote} className="mt-6" />
        </div>
        <div className="flex gap-2">
          <ButtonLink href={user ? '/app/trade' : '/register'} size="lg">{user ? 'Trade in sandbox' : 'Practise trading TSLA'}</ButtonLink>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <PriceChartCard defaultRange="1Y" height={360} title={<p className="eyebrow">Historical price · simulated</p>} />
        </Card>
        <Card className="p-6">
          <p className="eyebrow mb-4">Key statistics</p>
          <dl className="divide-y divide-white/[0.05]">
            {metrics.map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5 text-sm">
                <dt className="text-mute">{k}</dt>
                <dd className="num text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-dim">Statistics derive from the sandbox price feed and are not real-time market data.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Company overview" subtitle="Public background information, for education" />
          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <p className="text-sm leading-relaxed text-mute sm:col-span-2">
              Tesla, Inc. designs, develops, manufactures and sells electric vehicles, and stationary energy generation and storage systems. Founded in 2003 and headquartered in Austin, Texas, the company went public on the Nasdaq in 2010. Its share price has historically been driven by delivery numbers, margins, product launches, autonomy and energy expectations, and broad interest-rate sentiment.
            </p>
            {[
              [Factory, 'Automotive', 'Electric sedans, SUVs, pickups and commercial vehicles, plus regulatory credits.'],
              [Zap, 'Energy generation & storage', 'Grid-scale and residential batteries, solar products.'],
              [Building2, 'Services & other', 'Charging network, insurance, used vehicles, parts and service.'],
              [Activity, 'Key drivers', 'Deliveries, margins, autonomy timelines, competition and macro rates.'],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Factory
              return (
                <div key={title as string} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-silver"><I className="size-[18px]" /></span>
                  <div>
                    <p className="text-sm font-medium">{title as string}</p>
                    <p className="mt-1 text-xs leading-relaxed text-mute">{body as string}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
        <Card>
          <CardHeader title="Key financial metrics" subtitle="Illustrative sample figures" action={<SimBadge>Sample</SimBadge>} />
          <dl className="grid grid-cols-2 gap-px p-6">
            {FINANCIALS.map(([k, v]) => (
              <div key={k} className="py-2.5">
                <dt className="text-[11px] text-dim">{k}</dt>
                <dd className="num mt-0.5 text-sm text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="px-6 pb-6 text-[11px] leading-relaxed text-dim">Figures are illustrative for learning purposes and may not reflect the company’s latest filings. Consult official SEC filings for accurate data.</p>
        </Card>
      </div>

      <Card className="mt-6 p-6 sm:p-8" id="risk">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <span className="grid size-11 place-items-center rounded-2xl bg-warn/10 text-warn"><TriangleAlert className="size-5" /></span>
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">Risk & volatility</h2>
            <p className="mt-3 text-sm leading-relaxed text-mute">TSLA has historically been significantly more volatile than the broad market. Large daily moves are common, and drawdowns of 50% or more have occurred.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['30-day volatility (annualised)', `${quote.volatility30d}%`, 'Computed from the simulated feed. Broad-market indices typically sit around 12–20%.'],
              ['Beta (illustrative)', '≈ 2.3', 'A beta above 1 means the stock tends to amplify market moves in both directions.'],
              ['Concentration risk', 'High', 'Holding one stock exposes you to company-specific events. Diversification reduces this.'],
              ['Valuation sensitivity', 'High', 'Growth expectations make the price sensitive to interest rates and guidance changes.'],
            ].map(([k, v, d]) => (
              <div key={k} className="rounded-2xl border border-white/[0.06] p-5">
                <div className="flex items-center gap-2 text-xs text-mute"><Gauge className="size-3.5" />{k}</div>
                <p className="num mt-2 text-xl text-white">{v}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-dim">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
