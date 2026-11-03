import { getSettings } from '@/server/settings'
import { AuthShell } from '@/components/auth/auth-shell'
import { paymentsConfig } from '@/server/payments/config'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getSettings()
  return <AuthShell branding={branding} live={paymentsConfig().livemode}>{children}</AuthShell>
}
