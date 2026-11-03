import Link from 'next/link'
import { DISCLOSURE, Logo, type Branding } from '@/components/brand'

export function SiteFooter({ branding, support }: { branding: Branding; support: { email: string; phone: string; hours: string } }) {
  const cols = [
    { title: 'Platform', links: [['/markets', 'TSLA overview'], ['/register', 'Open sandbox account'], ['/login', 'Sign in'], ['/app', 'Dashboard']] },
    { title: 'Learn', links: [['/learn', 'Investing basics'], ['/learn#risk', 'Risk & volatility'], ['/faq', 'FAQ']] },
    { title: 'Company', links: [['/support', 'Support'], ['/legal/terms', 'Terms of use'], ['/legal/privacy', 'Privacy policy']] },
  ]
  return (
    <footer className="relative mt-24 border-t border-white/[0.06] bg-ink-2">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo branding={branding} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">{branding.tagline}. An independent sandbox for learning — never real money.</p>
            <div className="mt-5 space-y-1 text-xs text-dim">
              <p>{support.email}</p>
              <p>{support.phone}</p>
              <p>{support.hours}</p>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="eyebrow mb-4">{c.title}</p>
              <ul className="space-y-2.5">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-silver/80 transition-colors hover:text-white">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="hairline my-10 h-px" />
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <p className="eyebrow mb-2 text-accent">Important disclosure</p>
          <p className="text-xs leading-relaxed text-mute">{DISCLOSURE}</p>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-3 text-xs text-dim sm:flex-row">
          <p>© {new Date().getFullYear()} {branding.platformName}. Independent sandbox platform.</p>
          <p>“Tesla” and “TSLA” are referenced for identification only and belong to their respective owners.</p>
        </div>
      </div>
    </footer>
  )
}
