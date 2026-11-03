import { getSettings } from '@/server/settings'
import { getCurrentUser } from '@/server/auth/session'
import { SandboxStrip } from '@/components/brand'
import { SiteHeader } from '@/components/site/header'
import { SiteFooter } from '@/components/site/footer'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser('customer')])
  return (
    <div className="flex min-h-dvh flex-col">
      <SandboxStrip />
      {settings.maintenance.enabled && (
        <div className="border-b border-warn/20 bg-warn/[0.08] px-4 py-2 text-center text-xs text-warn">{settings.maintenance.message}</div>
      )}
      <SiteHeader branding={settings.branding} signedIn={!!user} />
      <main className="flex-1">{children}</main>
      <SiteFooter branding={settings.branding} support={settings.support} />
    </div>
  )
}
