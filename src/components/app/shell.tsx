'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, Menu, X, type LucideIcon } from 'lucide-react'
import { Logo, type Branding } from '@/components/brand'
import { LogoutButton } from './logout-button'
import { RelTime } from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/format'

export type NavItem = { href: string; label: string; icon?: LucideIcon; badge?: string | number; exact?: boolean }

/** Sections of the customer account, shown as tabs under the site header. */
export const ACCOUNT_NAV: NavItem[] = [
  { href: '/account', label: 'Overview', exact: true },
  { href: '/account/portfolio', label: 'Portfolio' },
  { href: '/account/trade', label: 'Trade' },
  { href: '/account/funding', label: 'Add funds' },
  { href: '/account/withdraw', label: 'Withdraw' },
  { href: '/account/transactions', label: 'Activity' },
  { href: '/account/statements', label: 'Statements' },
  { href: '/account/kyc', label: 'Verification' },
  { href: '/account/support', label: 'Support' },
]

const SITE_LINKS = [
  { href: '/markets', label: 'TSLA' },
  { href: '/learn', label: 'Investing' },
  { href: '/about', label: 'About' },
]

const isActive = (pathname: string, item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'))

/** Vertical nav list, used by the admin console sidebar. */
export function SideNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-px">
      {items.map((item) => {
        const active = isActive(pathname, item)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn('group relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors', active ? 'bg-surface-3 font-medium text-fg' : 'text-fg-2 hover:bg-surface-3/70 hover:text-fg')}
          >
            {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent" />}
            {item.icon && <item.icon className={cn('size-[17px]', active ? 'text-fg' : 'text-faint group-hover:text-muted')} />}
            <span className="flex-1">{item.label}</span>
            {item.badge ? <span className="num rounded-full bg-accent px-1.5 text-[11px] leading-[18px] font-semibold text-white">{item.badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}

type Notif = { id: string; title: string; body: string; level: string; readAt: string | null; createdAt: string }

function useOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onOutside()
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [onOutside])
  return ref
}

function NotificationBell({ items }: { items: Notif[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useOutside<HTMLDivElement>(() => setOpen(false))
  const unread = items.filter((n) => !n.readAt).length
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative grid size-9 place-items-center rounded-md text-fg-2 hover:bg-surface-3 hover:text-fg" aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="num absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] animate-pop overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_16px_40px_-12px_rgb(0_0_0/0.2)]">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                className="text-[13px] text-muted hover:text-fg"
                onClick={async () => {
                  await api('/api/notifications', { body: { all: true } })
                  router.refresh()
                }}
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No notifications yet.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.readAt) {
                    await api('/api/notifications', { body: { id: n.id } })
                    router.refresh()
                  }
                }}
                className={cn('block w-full border-b border-hairline px-4 py-3 text-left last:border-0 hover:bg-surface-2', !n.readAt && 'bg-accent/[0.025]')}
              >
                <div className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : n.level === 'warning' ? 'bg-warn' : n.level === 'success' ? 'bg-gain' : 'bg-accent')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{n.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{n.body}</p>
                    <p className="mt-1 text-[12px] text-faint"><RelTime date={n.createdAt} /></p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AccountMenu({ user }: { user: { name: string; email: string; subtitle: string } }) {
  const [open, setOpen] = useState(false)
  const ref = useOutside<HTMLDivElement>(() => setOpen(false))
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 hover:bg-surface-3" aria-expanded={open} aria-haspopup="menu">
        <span className="grid size-8 place-items-center rounded-full bg-fg text-[12px] font-semibold text-white">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-[13px] leading-tight font-medium text-fg">{user.name}</span>
          <span className="num block text-[12px] leading-tight text-muted">{user.subtitle}</span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 animate-pop rounded-lg border border-hairline bg-surface p-1 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.2)]">
          <div className="border-b border-hairline px-3 py-2.5">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
          {[
            ['/account/profile', 'Profile and security'],
            ['/account/statements', 'Statements'],
            ['/account/support', 'Contact support'],
          ].map(([href, label]) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-fg-2 hover:bg-surface-3 hover:text-fg">
              {label}
            </Link>
          ))}
          <div className="mt-1 border-t border-hairline pt-1">
            <LogoutButton scope="customer" className="w-full" />
          </div>
        </div>
      )}
    </div>
  )
}

export function AccountHeader({
  branding,
  badges = {},
  user,
  notifications,
}: {
  branding: Branding
  badges?: Record<string, string>
  user: { name: string; email: string; subtitle: string }
  notifications: Notif[]
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }
  const nav = ACCOUNT_NAV.map((n) => (badges[n.href] ? { ...n, badge: badges[n.href] } : n))
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Logo branding={branding} href="/account" />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Site">
            {SITE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="px-2.5 py-2 text-[14px] text-muted hover:text-fg">{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell items={notifications} />
          <AccountMenu user={user} />
          <button className="ml-1 rounded-md p-2 text-fg-2 hover:bg-surface-3 md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close account menu' : 'Open account menu'} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {/* Section tabs (tablet/desktop) */}
      <nav className="mx-auto hidden max-w-7xl gap-1 px-5 sm:px-8 md:flex" aria-label="Account sections">
        {nav.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex items-center gap-1.5 px-3 pt-1 pb-3 text-[14px] whitespace-nowrap transition-colors', active ? 'font-medium text-fg' : 'text-muted hover:text-fg')}
            >
              {item.label}
              {item.badge && <span className="rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent">{item.badge}</span>}
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />}
            </Link>
          )
        })}
      </nav>
      {/* Section list (phones) */}
      {open && (
        <nav className="border-t border-hairline px-5 pb-4 md:hidden" aria-label="Account sections">
          <ul className="grid grid-cols-2 gap-x-4 py-2">
            {[...nav, { href: '/account/profile', label: 'Profile and security' }].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={cn('block border-b border-hairline py-3 text-[15px]', isActive(pathname, item) ? 'font-medium text-fg' : 'text-fg-2')}>
                  {item.label}
                  {item.badge && <span className="ml-1.5 text-[12px] text-accent">{item.badge}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
