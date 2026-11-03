import { getSettings } from '@/server/settings'
import { AuthShell } from '@/components/auth/auth-shell'

export default async function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getSettings()
  return <AuthShell branding={branding} admin>{children}</AuthShell>
}
