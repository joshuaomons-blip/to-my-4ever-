import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo, SandboxStrip, type Branding } from '@/components/brand'

export function AuthShell({ branding, children, admin, live = false }: { branding: Branding; children: ReactNode; admin?: boolean; live?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SandboxStrip live={live} />
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Logo branding={branding} href={admin ? '/admin/login' : '/'} suffix={admin ? 'Administration' : undefined} />
          {!admin && (
            <nav className="flex items-center gap-5 text-[14px] text-muted">
              <Link href="/markets" className="hidden hover:text-fg sm:inline">TSLA</Link>
              <Link href="/learn" className="hidden hover:text-fg sm:inline">Investing</Link>
              <Link href="/support" className="hover:text-fg">Support</Link>
            </nav>
          )}
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-12 sm:py-20">
        <div className="w-full max-w-[420px]">
          <div className="card p-7 sm:p-9">{children}</div>
          <p className="mt-6 text-center text-[13px] leading-relaxed text-muted">
            {admin
              ? 'Restricted area. Every sign-in and administrative action is recorded in the audit log.'
              : 'Independent platform, not affiliated with Tesla, Inc.'}
          </p>
        </div>
      </main>
    </div>
  )
}

export function AuthTitle({ title, subtitle, icon }: { title: string; subtitle?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-7">
      {icon && <div className="mb-4 [&>svg]:mb-0 [&>svg]:size-7">{icon}</div>}
      <h1 className="display text-[26px] leading-tight font-semibold">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
    </div>
  )
}
