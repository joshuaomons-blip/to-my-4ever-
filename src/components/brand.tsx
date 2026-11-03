import Link from 'next/link'
import { cn } from '@/lib/format'

export type Branding = { platformName: string; tagline: string; logoDataUrl: string }

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="6" fill="#15171a" />
      <path d="M7 21.5 L13 14.5 L17.5 18 L25 9.5" stroke="var(--color-accent)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ branding, href = '/', suffix, className }: { branding: Branding; href?: string; suffix?: string; className?: string }) {
  return (
    <Link href={href} className={cn('group flex items-center gap-2.5', className)} aria-label={`${branding.platformName} home`}>
      {branding.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoDataUrl} alt="" className="size-7 rounded-md object-contain" />
      ) : (
        <LogoMark />
      )}
      <span className="display text-[16px] font-semibold whitespace-nowrap text-fg">{branding.platformName}</span>
      {suffix && <span className="rounded-sm border border-hairline px-1.5 py-px text-[11px] font-medium text-muted">{suffix}</span>}
    </Link>
  )
}

/**
 * Permanent disclosure bar — intentionally not editable from the admin console.
 * `live` is true only when a live payment provider is configured.
 */
export function SandboxStrip({ className, live = false }: { className?: string; live?: boolean }) {
  return (
    <div className={cn('relative z-40 border-b border-hairline bg-surface px-4 py-2 text-center text-[13px] text-muted', className)}>
      <span className="mr-2 inline-flex items-center gap-1.5 font-medium text-fg">
        <span className={cn('size-1.5 rounded-full', live ? 'bg-gain' : 'bg-accent')} />
        {live ? 'Live payments' : 'Test mode'}
      </span>
      {live
        ? 'Share holdings and trades are simulated until a licensed brokerage is connected. Independent platform, not affiliated with Tesla, Inc.'
        : 'Payments, balances and trades are simulated. No real money moves. Independent platform, not affiliated with Tesla, Inc.'}
    </div>
  )
}

export const DISCLOSURE =
  'This is an independent platform. It is not affiliated with, endorsed by, or operated by Tesla, Inc. Share holdings and orders shown on this site are simulated: no shares are bought or sold on any exchange and no ownership of any security is conferred. In test mode, all payments and balances are simulated and have no cash value. Prices are simulated and are not real-time market data. Nothing on this site is investment, legal or tax advice. Investing in real securities involves risk, including loss of principal.'
