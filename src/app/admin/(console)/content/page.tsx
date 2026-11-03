import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { Card, CardHeader, PageHeader } from '@/components/ui'
import { SettingsForm } from '@/components/admin/settings-form'
import { AnnouncementsManager, BroadcastForm, FaqManager } from '@/components/admin/content-managers'

export const metadata: Metadata = { title: 'Website content' }

const SECTIONS = [
  ['homepage', 'Homepage'], ['announcements', 'Announcements'], ['notifications', 'Notifications'], ['support', 'Support'], ['faq', 'FAQ'], ['investment', 'Investment info'], ['maintenance', 'Maintenance'],
]

export default async function ContentPage() {
  await requireAdminPage('content:manage')
  const [s, announcements, faqs] = await Promise.all([
    getSettings(),
    prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.faq.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ])
  return (
    <>
      <PageHeader title="Website content" description="Edit public pages, communicate with customers and control maintenance mode. Changes go live immediately." />
      <nav className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
        {SECTIONS.map(([id, l]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-fg/10 px-3.5 py-1.5 text-xs text-muted hover:text-fg">{l}</a>)}
      </nav>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="homepage" className="scroll-mt-20">
          <CardHeader title="Homepage" subtitle="Hero copy and calls to action" action={<Link href="/" target="_blank" className="text-xs text-muted hover:text-fg">View site ↗</Link>} />
          <div className="p-6">
            <SettingsForm settingKey="homepage" initial={s.homepage} fields={[
              { name: 'heroEyebrow', label: 'Eyebrow label', type: 'text', maxLength: 60 },
              { name: 'heroHeadline', label: 'Headline', type: 'text', maxLength: 90 },
              { name: 'heroSubtext', label: 'Supporting text', type: 'textarea', maxLength: 320, rows: 3 },
              { name: 'primaryCta', label: 'Primary button', type: 'text', maxLength: 30 },
              { name: 'secondaryCta', label: 'Secondary button', type: 'text', maxLength: 30 },
            ]} />
          </div>
        </Card>
        <Card id="announcements" className="scroll-mt-20">
          <CardHeader title="Website announcements" subtitle="Banners on the homepage and customer dashboard" />
          <div className="p-6"><AnnouncementsManager items={announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))} /></div>
        </Card>
        <Card id="notifications" className="scroll-mt-20">
          <CardHeader title="Platform notifications" subtitle="Send an in-app notification to customers’ bell inbox" />
          <div className="p-6"><BroadcastForm /></div>
        </Card>
        <Card id="support" className="scroll-mt-20">
          <CardHeader title="Customer support information" subtitle="Shown on the support page and footer" />
          <div className="p-6">
            <SettingsForm settingKey="support" initial={s.support} cols={2} fields={[
              { name: 'email', label: 'Support email', type: 'email' },
              { name: 'phone', label: 'Phone', type: 'text', maxLength: 40 },
              { name: 'hours', label: 'Hours', type: 'text', maxLength: 80 },
              { name: 'note', label: 'Support note', type: 'textarea', maxLength: 300, rows: 3 },
            ]} />
          </div>
        </Card>
        <Card id="faq" className="scroll-mt-20 xl:col-span-2">
          <CardHeader title="FAQ content" subtitle="Published questions appear on /faq and the homepage" />
          <div className="p-6"><FaqManager items={faqs} /></div>
        </Card>
        <Card id="investment" className="scroll-mt-20">
          <CardHeader title="Investment information" subtitle="Shown on the homepage and Learn page. Separate paragraphs with a blank line." />
          <div className="p-6">
            <SettingsForm settingKey="investmentInfo" initial={s.investmentInfo} fields={[
              { name: 'title', label: 'Title', type: 'text', maxLength: 80 },
              { name: 'body', label: 'Body', type: 'textarea', maxLength: 4000, rows: 8 },
            ]} />
          </div>
        </Card>
        <Card id="maintenance" className="scroll-mt-20">
          <CardHeader title="Platform maintenance mode" subtitle="Pauses deposits, trading and withdrawals for customers. Admins are unaffected." />
          <div className="p-6">
            <SettingsForm settingKey="maintenance" initial={s.maintenance} submitLabel="Update maintenance mode" fields={[
              { name: 'enabled', label: 'Maintenance mode enabled', type: 'toggle', hint: 'Shows a banner site-wide and blocks money movement' },
              { name: 'message', label: 'Message shown to customers', type: 'textarea', maxLength: 300, rows: 3 },
            ]} />
          </div>
        </Card>
      </div>
    </>
  )
}
