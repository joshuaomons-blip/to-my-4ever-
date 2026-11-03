'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo, type Branding } from '@/components/brand'
import { buttonClass } from '@/components/ui'
import { cn } from '@/lib/format'

const NAV = [
  { href: '/markets', label: 'TSLA' },
  { href: '/learn', label: 'Investing' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Support' },
]

export function SiteHeader({ branding, signedIn }: { branding: Branding; signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Logo branding={branding} />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn('relative px-3 py-2 text-[15px] transition-colors', pathname === n.href ? 'text-fg' : 'text-muted hover:text-fg')}
              aria-current={pathname === n.href ? 'page' : undefined}
            >
              {n.label}
              {pathname === n.href && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-accent" />}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {signedIn ? (
            <Link href="/account" className={buttonClass('light', 'md')}>My account</Link>
          ) : (
            <>
              <Link href="/login" className={buttonClass('ghost', 'md', 'border-transparent bg-transparent')}>Sign in</Link>
              <Link href="/register" className={buttonClass('primary', 'md')}>Open an account</Link>
            </>
          )}
        </div>
        <button className="-mr-2 rounded-md p-2 text-fg-2 hover:bg-surface-3 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-hairline bg-surface px-5 pb-5 lg:hidden">
          <nav className="flex flex-col py-2" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn('border-b border-hairline py-3 text-[15px]', pathname === n.href ? 'font-medium text-fg' : 'text-fg-2')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {signedIn ? (
              <Link href="/account" className={buttonClass('light', 'lg')}>My account</Link>
            ) : (
              <>
                <Link href="/register" className={buttonClass('primary', 'lg')}>Open an account</Link>
                <Link href="/login" className={buttonClass('ghost', 'lg')}>Sign in</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
