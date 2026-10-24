'use client';
import { Badge, Icon, type IconName, Logo, ModeBanner, Spinner, ThemeToggle, cn, relativeTime } from '@aureon/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { Session } from '@/lib/types';
import { StepUpProvider } from './StepUp';

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('useSession outside AppShell');
  return s;
};

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/app', label: 'Overview', icon: 'dashboard' },
  { href: '/app/markets', label: 'Markets', icon: 'markets' },
  { href: '/app/orders', label: 'Orders', icon: 'orders' },
  { href: '/app/funding', label: 'Funding', icon: 'wallet' },
  { href: '/app/activity', label: 'Activity', icon: 'activity' },
  { href: '/app/documents', label: 'Statements', icon: 'document' },
  { href: '/app/support', label: 'Support', icon: 'support' },
  { href: '/app/settings', label: 'Settings', icon: 'settings' },
];

interface Notification { id: string; title: string; body: string; readAt: string | null; createdAt: string }

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<Notification[]>('/v1/notifications', { refreshMs: 30_000 });
  const unread = data?.filter((n) => !n.readAt).length ?? 0;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text">
        <Icon name="bell" />
        {unread ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread ? (
              <button type="button" className="text-[12.5px] text-accent-strong hover:underline" onClick={async () => { await api('/v1/notifications/read-all', { method: 'POST' }); reload(); }}>
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data?.length ? data.slice(0, 20).map((n) => (
              <li key={n.id} className={cn('border-b border-border px-4 py-3 last:border-0', !n.readAt && 'bg-accent-soft/40')}>
                <p className="text-[13px] font-medium text-text">{n.title}</p>
                {n.body ? <p className="mt-0.5 text-[12.5px] text-muted">{n.body}</p> : null}
                <p className="mt-1 text-[11.5px] text-faint">{relativeTime(n.createdAt)}</p>
              </li>
            )) : <li className="px-4 py-8 text-center text-[13px] text-muted">You're all caught up.</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api<Session>('/v1/auth/session')
      .then((s) => (s.mfaVerified ? setSession(s) : router.replace('/mfa')))
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'MFA_REQUIRED') router.replace('/mfa');
        else router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });
  }, [router, pathname]);

  useEffect(() => setMobileOpen(false), [pathname]);

  if (!session) {
    return <div className="flex min-h-screen items-center justify-center text-muted"><Spinner size={22} /><span className="sr-only">Loading</span></div>;
  }

  const logout = async () => {
    await api('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  };

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.href === '/app' ? pathname === '/app' : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
              active ? 'bg-surface text-text shadow-sm ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-text')}>
            <Icon name={n.icon} className={active ? 'text-accent' : ''} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <SessionCtx.Provider value={session}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <ModeBanner mode={session.operatingMode} />
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border px-3 py-5 lg:flex">
          <Link href="/app" className="mb-8 px-2"><Logo /></Link>
          {nav}
          <div className="mt-auto space-y-3 px-2">
            <div className="rounded-lg border border-border bg-surface-2/60 p-3 text-[12px] leading-relaxed text-muted">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-text"><Icon name="shield" size={14} />Partner-held accounts</p>
              Your brokerage account and securities are held by our licensed partner, not by Aureon Capital.
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur sm:px-8">
            <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
              <Icon name="menu" />
            </button>
            <Link href="/app" className="lg:hidden"><Logo /></Link>
            <form className="ml-auto hidden max-w-sm flex-1 md:block lg:ml-0" role="search" onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get('q');
              router.push(`/app/markets?q=${encodeURIComponent(String(q ?? ''))}`);
            }}>
              <label className="relative block">
                <span className="sr-only">Search stocks and ETFs</span>
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input name="q" placeholder="Search stocks and ETFs" className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none" />
              </label>
            </form>
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle compact />
              <Notifications />
              <div className="ml-1 hidden items-center gap-2 border-l border-border pl-3 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-ink-contrast" aria-hidden="true">
                  {session.user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="hidden leading-tight xl:block">
                  <p className="text-[13px] font-medium">{session.user.displayName}</p>
                  <p className="text-[11.5px] text-faint">{session.user.email}</p>
                </div>
              </div>
              <button type="button" onClick={logout} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Sign out" title="Sign out">
                <Icon name="logout" />
              </button>
            </div>
          </header>
          {mobileOpen ? <div className="border-b border-border bg-surface-2/60 px-4 py-3 lg:hidden">{nav}</div> : null}
          <main id="main" className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
          <footer className="border-t border-border px-4 py-6 text-[12px] leading-relaxed text-faint sm:px-8">
            <p>Investing involves risk, including possible loss of principal. Past performance does not guarantee future results. Brokerage services are provided by our licensed partner; see <Link className="underline" href="/legal/risk_disclosure">risk disclosure</Link>, <Link className="underline" href="/legal/fee_schedule">fees</Link> and <Link className="underline" href="/legal/complaints">complaints</Link>.</p>
            <p className="mt-1"><Badge tone="warning">Draft legal documents — pending professional review</Badge></p>
          </footer>
        </div>
      </div>
      <StepUpProvider />
    </SessionCtx.Provider>
  );
}
