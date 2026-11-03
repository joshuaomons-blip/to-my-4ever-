import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { prisma } from '@/server/db'
import { mailboxEnabled } from '@/server/mailer'
import { SandboxStrip } from '@/components/brand'
import { Card, EmptyState } from '@/components/ui'
import { dateTimeFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Sandbox mailbox', robots: { index: false } }

const LINK = /(https?:\/\/[^\s]+)/g

/** Development-only inbox showing emails the sandbox would have sent. Disabled when SANDBOX_MAILBOX=false. */
export default async function MailboxPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  if (!mailboxEnabled()) notFound()
  const { to } = await searchParams
  const emails = await prisma.outboxEmail.findMany({ where: to ? { to: to.toLowerCase() } : {}, orderBy: { createdAt: 'desc' }, take: 50 })
  return (
    <>
      <SandboxStrip />
      <div className="mx-auto max-w-3xl px-5 py-12">
        <p className="eyebrow">Development tool</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Sandbox mailbox</h1>
        <p className="mt-2 text-sm text-mute">Verification and password-reset emails are captured here instead of being sent. Disable with <code className="num">SANDBOX_MAILBOX=false</code> once SMTP is configured.</p>
        <form className="mt-6 flex gap-2">
          <input name="to" defaultValue={to} placeholder="Filter by recipient email" className="w-full rounded-xl border border-white/10 bg-ink px-3.5 py-2.5 text-sm" />
          <button className="rounded-full bg-white px-4 text-sm font-medium text-ink">Filter</button>
        </form>
        <div className="mt-6 space-y-3">
          {emails.length === 0 && <Card><EmptyState icon={<Inbox className="size-5" />} title="No emails yet" /></Card>}
          {emails.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-dim">
                <span>To: <span className="text-silver">{m.to}</span></span>
                <span>{dateTimeFmt(m.createdAt)}</span>
              </div>
              <p className="mt-2 font-medium">{m.subject}</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-mute">
                {m.body.split(LINK).map((part, i) =>
                  /^https?:\/\//.test(part) ? <a key={i} href={part} className="break-all text-accent underline">{part}</a> : part,
                )}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
