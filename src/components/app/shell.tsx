'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, BadgeCheck, Bell, FileText, LayoutDashboard, Menu, Receipt, UserRound, X,
  type LucideIcon,
} from 'lucide-react'
import { Logo, SandboxStrip, type Branding } from '@/components/brand'
import { LogoutButton } from './logout-button'
import { api } from '@/lib/api'
import { cn, relTime } from '@/lib/format'

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string | number; exact?: boolean }

export const CUSTOMER_NAV: NavItem[] = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/trade', label: 'Trade TSLA', icon: ArrowLeftRight },
  { href: '/app/funding', label: 'Deposit funds', icon: ArrowDownToLine },
  { href: '/app/withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { href: '/app/transactions', label: 'Transactions', icon: Receipt },
  { href: '/app/statements', label: 'Statements', icon: FileText },
  { href: '/app/kyc', label: 'Verification', icon: BadgeCheck },
  { href: '/app/profile', label: 'Profile & security', icon: UserRound },
]

export function SideNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
              active ? 'bg-white/[0.06] text-white' : 'text-mute hover:bg-white/[0.03] hover:text-white',
            )}
          >
            {active && <span className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-accent" />}
            <item.icon className={cn('size-[18px] transition-colors', active ? 'text-accent' : 'text-dim group-hover:text-silver')} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? <span className="num rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">{item.badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}

type Notif = { id: string; title: string; body: string; level: string; readAt: string | null; createdAt: string }

function NotificationBell({ items }: { items: Notif[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.readAt).length
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative grid size-9 place-items-center rounded-full border border-white/[0.08] text-silver hover:bg-white/[0.04] hover:text-white" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="size-4" />
        {unread > 0 && <span className="num absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-carbon-2/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button
                className="text-xs text-mute hover:text-white"
                onClick={async () => {
                  await api('/api/notifications', { body: { all: true } })
                  router.refresh()
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-mute">You’re all caught up.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.readAt) {
                    await api('/api/notifications', { body: { id: n.id } })
                    router.refresh()
                  }
                }}
                className={cn('block w-full border-b border-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.03]', !n.readAt && 'bg-white/[0.02]')}
              >
                <div className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : n.level === 'warning' ? 'bg-warn' : n.level === 'success' ? 'bg-gain' : 'bg-accent')} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white">{n.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-mute">{n.body}</p>
                    <p className="mt-1 text-[10px] text-dim">{relTime(n.createdAt)}</p>
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

export function AppShell({
  branding,
  badges = {},
  user,
  notifications,
  children,
  banner,
}: {
  branding: Branding
  badges?: Record<string, string>
  user: { name: string; email: string; subtitle: string }
  notifications: Notif[]
  children: ReactNode
  banner?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }
  const nav = CUSTOMER_NAV.map((n) => (badges[n.href] ? { ...n, badge: badges[n.href] } : n))
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6">
        <Logo branding={branding} href="/app" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 pl-6">
        <p className="eyebrow mb-3 px-3 text-[9.5px]">Sandbox account</p>
        <SideNav items={nav} onNavigate={() => setOpen(false)} />
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <div className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-silver/30 to-white/5 text-xs font-semibold">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-dim">{user.subtitle}</p>
          </div>
        </div>
        <LogoutButton scope="customer" className="w-full" />
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/[0.06] bg-ink-2 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-up border-r border-white/[0.06] bg-ink-2">
            <button className="absolute top-4 right-3 rounded-full p-2 text-mute" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <SandboxStrip />
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex items-center gap-2">
            <button className="-ml-1 rounded-full p-2 text-silver lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <div className="lg:hidden"><Logo branding={branding} href="/app" /></div>
            <span className="hidden items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.08] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent lg:inline-flex">
              <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" /> Sandbox mode · virtual funds
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell items={notifications} />
            <Link href="/app/profile" className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-silver/30 to-white/5 text-xs font-semibold" aria-label="Profile">{initials}</Link>
          </div>
        </div>
      </header>
      {banner}
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-4 pb-10 text-[11px] leading-relaxed text-dim sm:px-8">
        Sandbox environment. All balances, holdings and transactions are simulated and are not real investments. Independent platform, not affiliated with Tesla, Inc.
      </footer>
    </div>
  )
}
