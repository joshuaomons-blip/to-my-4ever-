'use client'

import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Cog, CreditCard, FileClock, LayoutGrid, LifeBuoy, Menu, Newspaper, Receipt, Scale, ShieldCheck, UserCog, Users, X,
} from 'lucide-react'
import { Logo, type Branding } from '@/components/brand'
import { SideNav, type NavItem } from '@/components/app/shell'
import { LogoutButton } from '@/components/app/logout-button'

const ALL: (NavItem & { perm?: string; group: string })[] = [
  { href: '/admin', label: 'Overview', icon: LayoutGrid, exact: true, group: 'Monitor' },
  { href: '/admin/customers', label: 'Customers', icon: Users, perm: 'customers:read', group: 'Customers' },
  { href: '/admin/kyc', label: 'Identity reviews', icon: BadgeCheck, perm: 'kyc:review', group: 'Customers' },
  { href: '/admin/support', label: 'Support requests', icon: LifeBuoy, perm: 'support:manage', group: 'Customers' },
  { href: '/admin/deposits', label: 'Deposits', icon: ArrowDownToLine, perm: 'payments:review', group: 'Money' },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, perm: 'withdrawals:review', group: 'Money' },
  { href: '/admin/transactions', label: 'Transactions', icon: Receipt, perm: 'transactions:read', group: 'Money' },
  { href: '/admin/adjustments', label: 'Balance corrections', icon: Scale, perm: 'ledger:adjust', group: 'Money' },
  { href: '/admin/payments', label: 'Payment provider', icon: CreditCard, perm: 'payments:review', group: 'Money' },
  { href: '/admin/content', label: 'Website content', icon: Newspaper, perm: 'content:manage', group: 'Platform' },
  { href: '/admin/settings', label: 'Settings', icon: Cog, perm: 'settings:manage', group: 'Platform' },
  { href: '/admin/admins', label: 'Administrators', icon: UserCog, perm: 'admins:manage', group: 'Platform' },
  { href: '/admin/audit', label: 'Audit log', icon: FileClock, perm: 'audit:read', group: 'Platform' },
  { href: '/admin/security', label: 'My security', icon: ShieldCheck, group: 'Account' },
]

export function AdminShell({
  branding,
  permissions,
  badges,
  user,
  modeLabel,
  live,
  children,
}: {
  branding: Branding
  permissions: string[]
  badges: Record<string, number>
  user: { name: string; email: string; role: string }
  modeLabel: string
  live: boolean
  children: ReactNode
}) {
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
      <div className="flex h-16 items-center border-b border-hairline px-5">
        <Logo branding={branding} href="/admin" suffix="Admin" />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1.5 px-3 text-[12px] font-medium text-faint">{g}</p>
            <SideNav items={items.filter((i) => i.group === g)} onNavigate={() => setOpen(false)} />
          </div>
        ))}
      </div>
      <div className="border-t border-hairline p-3">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-[12px] text-muted">{user.email}</p>
          <p className="mt-0.5 text-[12px] text-muted">{user.role === 'SUPER_ADMIN' ? 'Super administrator' : user.role === 'ADMIN' ? 'Administrator' : 'Support'}</p>
        </div>
        <LogoutButton scope="admin" className="w-full" />
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-hairline bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-fg/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-pop border-r border-hairline bg-surface">
            <button className="absolute top-4 right-3 rounded-md p-2 text-muted hover:bg-surface-3" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex items-center gap-2">
            <button className="-ml-1 rounded-md p-2 text-fg-2 hover:bg-surface-3 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <span className="text-[14px] font-medium text-fg-2">Administration</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${live ? 'border-gain/25 text-gain' : 'border-warn/30 text-warn'}`}>
            <span className={`size-1.5 rounded-full ${live ? 'bg-gain' : 'bg-warn'}`} />
            {modeLabel}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">{children}</main>
    </div>
  )
}
