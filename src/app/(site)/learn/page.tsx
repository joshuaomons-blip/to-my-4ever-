import type { Metadata } from 'next'
import { getSettings } from '@/server/settings'
import { ButtonLink, Card } from '@/components/ui'

export const metadata: Metadata = { title: 'Learn' }

const SECTIONS = [
  {
    id: 'tsla',
    kicker: '01',
    title: 'Introduction to Tesla stock',
    body: [
      'TSLA is the ticker symbol for Tesla, Inc. common stock, listed on the Nasdaq. Buying a share means owning a small piece of the company, with no guarantee of profit.',
      'The stock is widely held by retail and institutional investors and is known for strong opinions on both sides, which contributes to large price swings.',
    ],
  },
  {
    id: 'basics',
    kicker: '02',
    title: 'How stock investing works',
    body: [
      'Investors place orders through a licensed broker. A market order executes at the best available price; a limit order only executes at your price or better.',
      'Fractional shares let you invest a dollar amount rather than a whole share. Prices move with supply and demand, driven by earnings, guidance, news and the wider economy.',
      'On this platform, orders are filled instantly by a simulated broker at a simulated price, so you can learn the mechanics without buying real shares.',
    ],
  },
  {
    id: 'risk',
    kicker: '03',
    title: 'Risk management',
    body: [
      'Only invest money you can afford to lose and won’t need soon. Decide position size before you buy: many investors cap any single stock at a small share of their portfolio.',
      'Diversify across companies, sectors and asset classes. Keep an emergency fund in cash. Understand fees, because small percentages compound over time.',
    ],
  },
  {
    id: 'volatility',
    kicker: '04',
    title: 'Market volatility',
    body: [
      'Volatility measures how much a price swings. High-volatility stocks can rise or fall sharply in days. Volatility is not the same as risk of permanent loss, but it tests discipline.',
      'Panic-selling during drops often locks in losses. Having a written plan for what you will do in a 30% drawdown helps you avoid emotional decisions.',
    ],
  },
  {
    id: 'horizon',
    kicker: '05',
    title: 'Long-term versus short-term investing',
    body: [
      'Long-term investors hold through cycles, aiming to benefit from business growth and compounding. Short-term trading tries to profit from price moves over days or weeks.',
      'Short-term trading involves more decisions, more costs and often higher taxes. Most studies find that frequent traders underperform simple buy-and-hold strategies on average.',
    ],
  },
]

export default async function LearnPage() {
  const { investmentInfo } = await getSettings()
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-3xl">
        <p className="eyebrow">Education</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Learn before you invest.</h1>
        <p className="mt-5 text-lg text-muted">Concise, practical lessons, then put them to work in your simulated portfolio.</p>
      </div>
      <div className="mt-14 grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block">
          <ul className="sticky top-28 space-y-1 border-l border-fg/[0.06]">
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-muted hover:border-accent hover:text-fg">{s.title}</a></li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <Card key={s.id} id={s.id} className="scroll-mt-28 p-7 sm:p-9">
              <p className="num text-xs text-accent">{s.kicker}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">{s.title}</h2>
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted">{s.body.map((p, i) => <p key={i}>{p}</p>)}</div>
            </Card>
          ))}
          <Card className="p-7 sm:p-9">
            <p className="eyebrow">{investmentInfo.title}</p>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">{investmentInfo.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
            <ButtonLink href="/register" className="mt-6">Open an account</ButtonLink>
          </Card>
        </div>
      </div>
    </div>
  )
}
