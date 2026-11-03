import type { Metadata } from 'next'
import { requireAdminPage } from '@/server/auth/session'
import { ACCENTS, getSettings } from '@/server/settings'
import { getBroker } from '@/server/broker'
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui'
import { SettingsForm } from '@/components/admin/settings-form'
import { AppearanceForm, BrandingForm } from '@/components/admin/branding'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  await requireAdminPage('settings:manage')
  const s = await getSettings()
  const broker = getBroker()
  return (
    <>
      <PageHeader eyebrow="Platform" title="Settings" description="Branding, appearance, simulated trading economics and security policy." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Branding" subtitle="Platform name and logo" />
          <div className="p-6"><BrandingForm initial={s.branding} /></div>
        </Card>
        <Card>
          <CardHeader title="Website appearance" />
          <div className="p-6"><AppearanceForm initial={s.appearance} accents={ACCENTS} /></div>
        </Card>
        <Card>
          <CardHeader title="Simulated trading fees & limits" subtitle="Applied to every new sandbox order, deposit and withdrawal" />
          <div className="p-6">
            <SettingsForm settingKey="trading" initial={s.trading} cols={2} fields={[
              { name: 'feeBps', label: 'Trading fee', type: 'number', suffix: 'bps', min: 0, max: 500, hint: '10 bps = 0.10% of order value' },
              { name: 'feeFlat', label: 'Flat fee per order', type: 'number', prefix: '$', step: '0.01', min: 0, max: 50 },
              { name: 'minOrder', label: 'Minimum order', type: 'number', prefix: '$', step: '0.01', min: 1 },
              { name: 'minDeposit', label: 'Minimum deposit', type: 'number', prefix: '$', step: '0.01', min: 1 },
              { name: 'maxDeposit', label: 'Maximum deposit', type: 'number', prefix: '$', step: '1', min: 10 },
              { name: 'minWithdrawal', label: 'Minimum withdrawal', type: 'number', prefix: '$', step: '0.01', min: 1 },
              { name: 'depositSettlementSeconds', label: 'Deposit settlement delay', type: 'number', suffix: 'sec', min: 0, max: 3600, hint: 'Simulated clearing time before funds are available' },
            ]} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Security policy" />
            <div className="p-6">
              <SettingsForm settingKey="security" initial={s.security} fields={[
                { name: 'requireAdminMfa', label: 'Require two-factor authentication for all administrators', type: 'toggle', hint: 'Admins without 2FA are redirected to set it up before accessing the console.' },
              ]} submitLabel="Save policy" />
            </div>
          </Card>
          <Card>
            <CardHeader title="Brokerage adapter" subtitle="Configured on the server via BROKER_MODE" action={<Badge tone={broker.simulated ? 'accent' : 'gain'} dot>{broker.mode}</Badge>} />
            <div className="space-y-2 p-6 text-sm text-mute">
              <p><span className="text-white">{broker.label}.</span> All deposits, withdrawals and orders pass through this adapter.</p>
              <p>Live adapters (Alpaca Broker API, DriveWealth) are deliberately not implemented. Connecting one requires a licensed broker-dealer agreement, regulated KYC/AML and funding rails, server-side secrets and compliance review.</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
