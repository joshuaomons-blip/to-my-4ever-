'use client';
import { Badge, Icon, type IconName, Logo, ModeBanner, Spinner, ThemeToggle, cn } from '@aureon/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { StepUpProvider } from './StepUp';

const Ctx = createContext<Me | null>(null);
export const useMe = () => useContext(Ctx)!;
export const can = (me: Me, p: string) => me.permissions.includes(p);

const NAV: Array<{ group: string; items: Array<{ href: string; label: string; icon: IconName; perm: string }> }> = [
  { group: 'Operations', items: [
    { href: '/', label: 'Overview', icon: 'dashboard', perm: 'customers.read' },
    { href: '/customers', label: 'Customers', icon: 'users', perm: 'customers.read' },
    { href: '/support', label: 'Support', icon: 'support', perm: 'support.read' },
  ] },
  { group: 'Compliance', items: [
    { href: '/reviews', label: 'Onboarding reviews', icon: 'clipboard', perm: 'onboarding.review' },
    { href: '/alerts', label: 'Monitoring alerts', icon: 'alert', perm: 'alerts.manage' },
    { href: '/reports', label: 'Reports', icon: 'document', perm: 'reports.read' },
    { href: '/audit', label: 'Audit log', icon: 'shield', perm: 'audit.read' },
  ] },
  { group: 'Money', items: [
    { href: '/withdrawals', label: 'Withdrawals', icon: 'wallet', perm: 'withdrawals.review' },
    { href: '/payments', label: 'Deposits', icon: 'arrowDownLeft', perm: 'payments.read' },
    { href: '/reconciliation', label: 'Reconciliation', icon: 'scale', perm: 'reconciliation.manage' },
    { href: '/fees', label: 'Fee schedules', icon: 'orders', perm: 'fees.manage' },
  ] },
  { group: 'Platform', items: [
    { href: '/controls', label: 'Controls & jurisdictions', icon: 'globe', perm: 'system.read' },
    { href: '/launch-gates', label: 'Launch gates', icon: 'flag', perm: 'system.read' },
    { href: '/system', label: 'System health', icon: 'server', perm: 'system.read' },
    { href: '/staff', label: 'Staff', icon: 'lock', perm: 'staff.manage' },
  ] },
];

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>('/auth/me').then((m) => (m.mfaVerified ? setMe(m) : router.replace('/login'))).catch(() => router.replace('/login'));
  }, [router]);
  if (!me) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  return (
    <Ctx.Provider value={me}>
      <ModeBanner mode="sandbox" />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-3 py-5 md:flex">
          <div className="mb-6 px-2"><Logo suffix="Admin" /></div>
          {NAV.map((g) => {
            const items = g.items.filter((i) => can(me, i.perm));
            if (!items.length) return null;
            return (
              <div key={g.group} className="mb-5">
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{g.group}</p>
                {items.map((i) => {
                  const active = i.href === '/' ? path === '/' : path.startsWith(i.href);
                  return (
                    <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}
                      className={cn('flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px]', active ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:text-text')}>
                      <Icon name={i.icon} size={16} className={active ? 'text-accent' : ''} />{i.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-6 backdrop-blur">
            <div className="flex flex-wrap gap-1.5">{me.roles.map((r) => <Badge key={r} tone="accent">{r.replace(/_/g, ' ')}</Badge>)}</div>
            <div className="flex items-center gap-3">
              <span className="hidden text-[13px] text-muted sm:inline">{me.display_name}</span>
              <ThemeToggle compact />
              <button type="button" aria-label="Sign out" className="rounded-lg p-2 text-muted hover:bg-surface-2" onClick={async () => { await api('/auth/logout', { method: 'POST' }); router.replace('/login'); }}><Icon name="logout" /></button>
            </div>
          </header>
          <main className="px-6 py-7">{children}</main>
        </div>
      </div>
      <StepUpProvider />
    </Ctx.Provider>
  );
}

export function Title({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="display text-[26px] font-medium">{title}</h1>{description ? <p className="mt-1 max-w-3xl text-[13.5px] text-muted">{description}</p> : null}</div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
