import { getSettings } from '@/server/settings'
import { AuthShell } from '@/components/auth/auth-shell'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getSettings()
  return <AuthShell branding={branding}>{children}</AuthShell>
}
