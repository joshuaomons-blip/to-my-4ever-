import { Badge, Button, Icon, Logo, ModeBanner, ThemeToggle } from '@aureon/ui';
import Link from 'next/link';

const STEPS = [
  ['01', 'Verify', 'Create an account, secure it with two-factor authentication and verify your identity. It takes a few minutes.'],
  ['02', 'Fund', 'Link a bank account you own and deposit. Cash is credited to your brokerage account held with our licensed partner.'],
  ['03', 'Invest', 'Buy and sell US-listed stocks and ETFs with clear previews of price, commission and the cash reserved.'],
] as const;

const PRINCIPLES: Array<[string, string, 'shield' | 'scale' | 'lock' | 'globe']> = [
  ['Partner custody', 'Your account, securities and cash are held by a licensed brokerage partner — never by us.', 'shield'],
  ['Every price timestamped', 'Quotes show their source and age. Market orders are blocked when data is stale.', 'scale'],
  ['Security by default', 'Mandatory MFA, re-confirmation for withdrawals, and withdrawals only to accounts you funded from.', 'lock'],
  ['Honest availability', 'We only open accounts where we have the required authorisation or partner arrangement.', 'globe'],
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <ModeBanner mode={process.env.NEXT_PUBLIC_OPERATING_MODE ?? 'sandbox'} />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Main">
          <Link href="/legal/fee_schedule" className="hidden px-3 text-[14px] text-muted hover:text-text sm:block">Pricing</Link>
          <Link href="/legal/risk_disclosure" className="hidden px-3 text-[14px] text-muted hover:text-text sm:block">Risks</Link>
          <ThemeToggle compact />
          <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
          <Link href="/register"><Button>Open account</Button></Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        <div>
          <Badge tone="accent">Stocks & ETFs · via licensed partners</Badge>
          <h1 className="display mt-6 text-[46px] font-medium leading-[1.04] sm:text-[64px]">
            Invest with <em className="text-accent not-italic">clarity</em>,<br />not noise.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
            Aureon Capital gives you a calm, precise way to build a portfolio of listed companies and funds — with transparent costs and every number traceable to its source.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register"><Button size="lg">Get started<Icon name="arrowUpRight" size={16} /></Button></Link>
            <Link href="/legal/risk_disclosure"><Button size="lg" variant="secondary">Understand the risks</Button></Link>
          </div>
          <p className="mt-6 text-[12.5px] text-faint">Capital at risk. Availability depends on your country of residence.</p>
        </div>
        <div aria-hidden="true" className="relative">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between"><span className="text-[13px] text-muted">Portfolio value</span><Badge tone="warning">Illustrative</Badge></div>
            <p className="num mt-2 text-[34px] font-medium">$48,210.37</p>
            <p className="num text-[13px] text-pos">+$312.44 (0.65%) today</p>
            <svg viewBox="0 0 320 110" className="mt-5 w-full">
              <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.2" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 86 C30 80 45 92 70 74 S110 60 130 64 170 40 195 46 235 30 260 34 300 14 320 18 L320 110 L0 110Z" fill="url(#lg)" />
              <path d="M0 86 C30 80 45 92 70 74 S110 60 130 64 170 40 195 46 235 30 260 34 300 14 320 18" fill="none" stroke="var(--accent)" strokeWidth="2" />
            </svg>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-[12.5px]">
              {[['Cash', '$3,120.00'], ['Invested', '$45,090'], ['Holdings', '9']].map(([k, v]) => <div key={k}><p className="text-muted">{k}</p><p className="num mt-0.5 font-medium">{v}</p></div>)}
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-border bg-surface px-4 py-3 shadow-pop sm:block">
            <p className="text-[12px] text-muted">Order filled · VOO</p>
            <p className="num text-[14px] font-medium">Buy 4 @ $531.20</p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
          {STEPS.map(([n, t, d]) => (
            <div key={n}>
              <p className="num text-[13px] text-accent-strong">{n}</p>
              <h2 className="display mt-2 text-[24px] font-medium">{t}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="display max-w-2xl text-[34px] font-medium leading-tight">Built on principles you can verify.</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map(([t, d, icon]) => (
            <div key={t} className="rounded-xl border border-border bg-surface p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent-strong"><Icon name={icon} /></span>
              <h3 className="mt-4 text-[16px] font-semibold">{t}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-4 px-5 py-10 text-[12.5px] leading-relaxed text-faint">
          <Logo />
          <p>Aureon Capital is a placeholder brand for a platform under development. It is <strong>not</strong> currently authorised or registered to provide investment, brokerage or payment services in any jurisdiction. When launched, brokerage, custody and execution services will be provided by a licensed partner identified in your account documentation.</p>
          <p>Investing involves risk, including loss of principal. Nothing on this site is investment advice or an offer to residents of any jurisdiction where such an offer would be unlawful.</p>
          <nav className="flex flex-wrap gap-4" aria-label="Legal">
            {[['terms_of_service', 'Terms'], ['privacy_policy', 'Privacy'], ['risk_disclosure', 'Risk disclosure'], ['fee_schedule', 'Fees'], ['complaints', 'Complaints']].map(([k, l]) => <Link key={k} href={`/legal/${k}`} className="hover:text-text">{l}</Link>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}
