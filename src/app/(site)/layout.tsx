import { getSettings } from '@/server/settings'
import { getCurrentUser } from '@/server/auth/session'
import { paymentsConfig } from '@/server/payments/config'
import { SandboxStrip } from '@/components/brand'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser('customer')])
  return (
    <div className="flex min-h-dvh flex-col">
      <SandboxStrip live={paymentsConfig().livemode} />
      {settings.maintenance.enabled && <div className="border-b border-warn/25 bg-warn/[0.07] px-4 py-2 text-center text-[13px] text-warn">{settings.maintenance.message}</div>}
      <SiteHeader branding={settings.branding} signedIn={!!user} />
      <main className="flex-1">{children}</main>
      <SiteFooter branding={settings.branding} support={settings.support} />
    </div>
  )
}
