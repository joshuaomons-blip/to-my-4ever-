'use client'

import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import {
  ArrowUpFromLine, BadgeCheck, Cog, FileClock, LayoutGrid, Menu, Newspaper, Receipt, ShieldCheck, UserCog, Users, X,
} from 'lucide-react'
import { Logo, type Branding } from '@/components/brand'
import { SideNav, type NavItem } from '@/components/app/shell'
import { LogoutButton } from '@/components/app/logout-button'

const ALL: (NavItem & { perm?: string; group: string })[] = [
  { href: '/admin', label: 'Overview', icon: LayoutGrid, exact: true, group: 'Monitor' },
  { href: '/admin/customers', label: 'Customers', icon: Users, perm: 'customers:read', group: 'Operations' },
  { href: '/admin/kyc', label: 'KYC reviews', icon: BadgeCheck, perm: 'kyc:review', group: 'Operations' },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, perm: 'withdrawals:review', group: 'Operations' },
  { href: '/admin/transactions', label: 'Transactions', icon: Receipt, perm: 'transactions:read', group: 'Operations' },
  { href: '/admin/content', label: 'Website content', icon: Newspaper, perm: 'content:manage', group: 'Platform' },
  { href: '/admin/settings', label: 'Settings', icon: Cog, perm: 'settings:manage', group: 'Platform' },
  { href: '/admin/admins', label: 'Administrators', icon: UserCog, perm: 'admins:manage', group: 'Platform' },
  { href: '/admin/audit', label: 'Audit log', icon: FileClock, perm: 'audit:read', group: 'Platform' },
  { href: '/admin/security', label: 'My security', icon: ShieldCheck, group: 'Account' },
]

export function AdminShell({ branding, permissions, badges, user, children }: { branding: Branding; permissions: string[]; badges: Record<string, number>; user: { name: string; email: string; role: string }; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }
  const items = ALL.filter((i) => !i.perm || permissions.includes(i.perm)).map((i) => ({ ...i, badge: badges[i.href] || undefined }))
  const groups = [...new Set(items.map((i) => i.group))]

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6"><Logo branding={branding} href="/admin" suffix="Admin" /></div>
      <div className="flex-1 space-y-6 overflow-y-auto py-4 pr-3 pl-6">
        {groups.map((g) => (
          <div key={g}>
            <p className="eyebrow mb-2 px-3 text-[9.5px]">{g}</p>
            <SideNav items={items.filter((i) => i.group === g)} onNavigate={() => setOpen(false)} />
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <div className="mb-1 px-3 py-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-[11px] text-dim">{user.email}</p>
          <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-silver">{user.role.replace('_', ' ')}</p>
        </div>
        <LogoutButton scope="admin" className="w-full" />
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/[0.06] bg-[#0a0a0a] lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-up border-r border-white/[0.06] bg-[#0a0a0a]">
            <button className="absolute top-4 right-3 rounded-full p-2 text-mute" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink/85 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex items-center gap-2">
            <button className="-ml-1 rounded-full p-2 text-silver lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-silver">Administration console</span>
          </div>
          <span className="rounded-full border border-accent/25 bg-accent/[0.08] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-accent">Sandbox data</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">{children}</main>
    </div>
  )
}
