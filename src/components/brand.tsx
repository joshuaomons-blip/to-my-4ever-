import Link from 'next/link'
import { cn } from '@/lib/format'

export type Branding = { platformName: string; tagline: string; logoDataUrl: string }

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#121212" stroke="rgba(255,255,255,.08)" />
      <path d="M7 22 L13 15 L17 18.5 L25 9.5" stroke="var(--color-accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="9.5" r="2" fill="#fff" />
    </svg>
  )
}

export function Logo({ branding, href = '/', suffix, className }: { branding: Branding; href?: string; suffix?: string; className?: string }) {
  return (
    <Link href={href} className={cn('group flex items-center gap-2.5', className)} aria-label={`${branding.platformName} home`}>
      {branding.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoDataUrl} alt="" className="size-7 rounded-lg object-contain" />
      ) : (
        <LogoMark />
      )}
      <span className="font-display text-[15px] font-semibold tracking-[-0.02em] whitespace-nowrap text-white">{branding.platformName}</span>
      {suffix && <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-mute">{suffix}</span>}
    </Link>
  )
}

/** Permanent disclosure — intentionally not editable from the admin console. */
export function SandboxStrip({ className }: { className?: string }) {
  return (
    <div className={cn('relative z-40 border-b border-accent/20 bg-gradient-to-r from-accent/[0.14] via-accent/[0.07] to-accent/[0.14] px-4 py-1.5 text-center text-[11px] text-silver', className)}>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Sandbox</span>
      <span className="mx-2 text-dim">·</span>
      Virtual funds and simulated trades only. Not real investments. Independent platform, not affiliated with Tesla, Inc.
    </div>
  )
}

export const DISCLOSURE =
  'This is an independent educational sandbox. It is not affiliated with, endorsed by, or operated by Tesla, Inc. All balances, deposits, withdrawals, orders and holdings are simulated with virtual funds, carry no cash value and do not represent ownership of any security. Prices are simulated and are not real-time market data. Nothing on this site is investment, legal or tax advice. Investing in real securities involves risk, including loss of principal.'
