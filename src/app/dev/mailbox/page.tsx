import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { prisma } from '@/server/db'
import { mailboxEnabled } from '@/server/mailer'
import { getCurrentUser } from '@/server/auth/session'
import Link from 'next/link'
import { SandboxStrip } from '@/components/brand'
import { Card, EmptyState } from '@/components/ui'
import { dateTimeFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Test mailbox', robots: { index: false } }

const LINK = /(https?:\/\/[^\s]+)/g

/** Development-only inbox showing emails the sandbox would have sent. Disabled when SANDBOX_MAILBOX=false. */
export default async function MailboxPage() {
  if (!mailboxEnabled()) notFound()
  // Only ever show a signed-in customer their own emails: these contain account links.
  const user = await getCurrentUser('customer')
  const emails = user ? await prisma.outboxEmail.findMany({ where: { to: user.email }, orderBy: { createdAt: 'desc' }, take: 50 }) : []
  return (
    <>
      <SandboxStrip />
      <div className="mx-auto max-w-3xl px-5 py-12">
                <h1 className="display mt-2 text-3xl font-semibold">Test mailbox</h1>
        <p className="mt-2 text-sm text-muted">Email isn’t sent in test mode. Messages to your address, such as your email confirmation link, appear here instead.</p>
        {!user && (
          <Card className="mt-6 p-5 text-sm text-fg-2">
            <Link href="/login" className="underline">Sign in</Link> to see the emails sent to your address, such as your email confirmation link.
          </Card>
        )}
        <div className="mt-6 space-y-3">
          {emails.length === 0 && <Card><EmptyState icon={<Inbox className="size-5" />} title="No emails yet" /></Card>}
          {emails.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-faint">
                <span>To: <span className="text-fg-2">{m.to}</span></span>
                <span>{dateTimeFmt(m.createdAt)}</span>
              </div>
              <p className="mt-2 font-medium">{m.subject}</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted">
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
