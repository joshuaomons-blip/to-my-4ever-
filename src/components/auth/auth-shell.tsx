import type { ReactNode } from 'react'
import { Logo, LogoMark, SandboxStrip, type Branding } from '@/components/brand'

export function AuthShell({ branding, children, admin }: { branding: Branding; children: ReactNode; admin?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SandboxStrip />
      <div className="grid flex-1 lg:grid-cols-[1fr_minmax(480px,560px)]">
        <aside className="relative hidden overflow-hidden border-r border-white/[0.06] bg-ink-2 lg:block">
          <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]" />
          <div className={admin ? 'absolute -bottom-40 -left-20 size-[560px] rounded-full bg-silver/[0.07] blur-[120px]' : 'absolute -bottom-40 -left-20 size-[560px] rounded-full bg-accent/[0.16] blur-[120px]'} />
          <div className="relative flex h-full flex-col justify-between p-12">
            <Logo branding={branding} href={admin ? '/admin/login' : '/'} suffix={admin ? 'Admin' : undefined} />
            <div>
              <svg viewBox="0 0 600 220" className="mb-10 w-full max-w-lg" aria-hidden>
                <defs>
                  <linearGradient id="authline" x1="0" x2="1">
                    <stop offset="0" stopColor="#ffffff" stopOpacity=".15" />
                    <stop offset="1" stopColor={admin ? '#c9ccd1' : 'var(--color-accent)'} />
                  </linearGradient>
                </defs>
                <path d="M0 180 C60 170 80 120 130 130 S210 170 250 120 S330 60 370 90 S450 140 490 70 S560 30 600 20" fill="none" stroke="url(#authline)" strokeWidth="2.5" strokeDasharray="1200" strokeDashoffset="1200" className="animate-draw" />
              </svg>
              <h2 className="max-w-md font-display text-4xl leading-tight font-semibold tracking-[-0.035em]">
                {admin ? 'Platform administration console.' : 'Practise investing in TSLA with zero real-world risk.'}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-mute">
                {admin
                  ? 'Restricted area. Every action is authenticated, permission-checked and recorded in the audit log.'
                  : 'Virtual funds, simulated orders and a full brokerage-style journey from verification to statements.'}
              </p>
            </div>
            <p className="text-xs text-dim">Independent sandbox · Not affiliated with Tesla, Inc.</p>
          </div>
        </aside>
        <main className="flex flex-col justify-center px-5 py-12 sm:px-12">
          <div className="mb-10 lg:hidden">
            <Logo branding={branding} href={admin ? '/admin/login' : '/'} suffix={admin ? 'Admin' : undefined} />
          </div>
          <div className="mx-auto w-full max-w-sm animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function AuthTitle({ title, subtitle, icon }: { title: string; subtitle?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-8">
      {icon ?? <LogoMark className="mb-6 size-10" />}
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em]">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-mute">{subtitle}</p>}
    </div>
  )
}
