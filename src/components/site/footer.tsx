import Link from 'next/link'
import { DISCLOSURE, Logo, type Branding } from '@/components/brand'

export function SiteFooter({ branding, support }: { branding: Branding; support: { email: string; phone: string; hours: string } }) {
  const cols = [
    { title: 'Platform', links: [['/markets', 'TSLA overview'], ['/register', 'Open an account'], ['/login', 'Sign in'], ['/account', 'My account']] },
    { title: 'Learn', links: [['/learn', 'Investing basics'], ['/learn#risk', 'Risk and volatility'], ['/faq', 'Questions']] },
    { title: 'Company', links: [['/about', 'About'], ['/support', 'Support'], ['/legal/terms', 'Terms of use'], ['/legal/privacy', 'Privacy policy']] },
  ]
  return (
    <footer className="mt-24 border-t border-hairline bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo branding={branding} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{branding.tagline}.</p>
            <address className="mt-5 space-y-1 text-sm text-muted not-italic">
              <a href={`mailto:${support.email}`} className="block hover:text-fg">{support.email}</a>
              <span className="block">{support.phone}</span>
              <span className="block">{support.hours}</span>
            </address>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="mb-3 text-sm font-semibold text-fg">{c.title}</p>
              <ul className="space-y-2">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-muted transition-colors hover:text-fg">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-hairline pt-6">
          <p className="max-w-4xl text-[13px] leading-relaxed text-muted">
            <span className="font-semibold text-fg-1">Important. </span>
            {DISCLOSURE}
          </p>
          <div className="mt-6 flex flex-col justify-between gap-2 text-[13px] text-faint sm:flex-row">
            <p>© {new Date().getFullYear()} {branding.platformName}</p>
            <p>“Tesla” and “TSLA” are used to identify the company and its stock and belong to their owners.</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
