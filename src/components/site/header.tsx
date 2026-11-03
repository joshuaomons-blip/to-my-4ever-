'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo, type Branding } from '@/components/brand'
import { buttonClass } from '@/components/ui'
import { cn } from '@/lib/format'

const NAV = [
  { href: '/markets', label: 'TSLA' },
  { href: '/learn', label: 'Learn' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Support' },
]

export function SiteHeader({ branding, signedIn }: { branding: Branding; signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={cn('sticky top-0 z-30 transition-all duration-300', scrolled || open ? 'border-b border-white/[0.06] bg-ink/80 backdrop-blur-xl' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo branding={branding} />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn('rounded-full px-3.5 py-2 text-sm transition-colors', pathname === n.href ? 'text-white' : 'text-mute hover:text-white')}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link href="/app" className={buttonClass('light', 'sm', 'h-9 px-4')}>Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-full px-3.5 py-2 text-sm text-silver hover:text-white">Sign in</Link>
              <Link href="/register" className={buttonClass('primary', 'sm', 'h-9 px-4')}>Open sandbox account</Link>
            </>
          )}
        </div>
        <button className="-mr-2 rounded-full p-2 text-silver md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="animate-fade-up border-t border-white/[0.06] px-5 pb-6 md:hidden">
          <nav className="flex flex-col py-3">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="border-b border-white/[0.04] py-3.5 text-[15px] text-silver">{n.label}</Link>
            ))}
          </nav>
          <div className="mt-2 flex flex-col gap-2">
            {signedIn ? (
              <Link href="/app" className={buttonClass('light', 'lg')}>Open dashboard</Link>
            ) : (
              <>
                <Link href="/register" className={buttonClass('primary', 'lg')}>Open sandbox account</Link>
                <Link href="/login" className={buttonClass('ghost', 'lg')}>Sign in</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
