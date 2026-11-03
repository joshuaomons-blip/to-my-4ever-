import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, CircleCheck, CircleDashed, Clock, MailWarning, ShieldX } from 'lucide-react'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { Alert, Card, PageHeader, StatusBadge } from '@/components/ui'
import { KycForm } from '@/components/app/kyc-form'
import { cn, dateFmt, dateTimeFmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Identity verification' }

export default async function KycPage() {
  const user = await requireCustomerPage()
  const kyc = await prisma.kycSubmission.findUnique({ where: { userId: user.id } })
  const status = kyc?.status ?? 'NOT_STARTED'
  const timeline = [
    { label: 'Account created', at: user.createdAt, done: true },
    { label: 'Email verified', at: user.emailVerifiedAt, done: !!user.emailVerifiedAt },
    { label: 'Details submitted', at: kyc?.submittedAt, done: !!kyc?.submittedAt },
    { label: status === 'REJECTED' ? 'Rejected' : 'Approved', at: kyc?.reviewedAt, done: status === 'APPROVED' || status === 'REJECTED', bad: status === 'REJECTED' },
  ]
  return (
    <>
      <PageHeader title="Identity verification" description="Confirm who you are so you can add funds, trade and withdraw. Our team reviews every submission." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-6 sm:p-8">
          {status === 'APPROVED' && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-gain/10 text-gain"><BadgeCheck className="size-8" /></span>
              <h2 className="mt-5 font-display text-2xl font-semibold">You’re verified</h2>
              <p className="mt-2 max-w-sm text-sm text-muted">Verification approved{kyc?.reviewedAt ? ` on ${dateFmt(kyc.reviewedAt)}` : ''}. Trading and withdrawals are unlocked.</p>
              <Link href="/account/trade" className="mt-6 text-sm text-fg underline">Start trading TSLA →</Link>
            </div>
          )}
          {status === 'PENDING' && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-warn/10 text-warn"><Clock className="size-8" /></span>
              <h2 className="mt-5 font-display text-2xl font-semibold">Under review</h2>
              <p className="mt-2 max-w-sm text-sm text-muted">Submitted {kyc?.submittedAt ? dateTimeFmt(kyc.submittedAt) : ''}. Our team will approve or reject your verification. You’ll get a notification.</p>
            </div>
          )}
          {!user.emailVerifiedAt && status === 'NOT_STARTED' && (
            <Alert tone="warn" icon={<MailWarning className="size-5" />} title="Verify your email first">
              Open the link we sent to {user.email}. In test mode, emails appear in the <Link className="underline" href="/dev/mailbox">test mailbox</Link>.
            </Alert>
          )}
          {(status === 'REJECTED' || (status === 'NOT_STARTED' && user.emailVerifiedAt)) && (
            <>
              {status === 'REJECTED' && (
                <Alert tone="loss" icon={<ShieldX className="size-5" />} title="Verification rejected" className="mb-6">
                  {kyc?.decisionReason ?? 'Please review your details and resubmit.'}
                </Alert>
              )}
              <KycForm defaults={{ legalName: kyc?.legalName ?? `${user.firstName} ${user.lastName}` }} />
            </>
          )}
        </Card>
        <Card className="h-fit p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Status</p>
            <StatusBadge status={status} />
          </div>
          <ol className="mt-6 space-y-5">
            {timeline.map((s, i) => (
              <li key={s.label} className="relative flex gap-3">
                {i < timeline.length - 1 && <span className={cn('absolute top-6 left-[9px] h-[calc(100%-4px)] w-px', s.done ? 'bg-gain/30' : 'bg-fg/10')} />}
                {s.done ? (s.bad ? <ShieldX className="size-5 shrink-0 text-loss" /> : <CircleCheck className="size-5 shrink-0 text-gain" />) : <CircleDashed className="size-5 shrink-0 text-faint" />}
                <div>
                  <p className={cn('text-sm', s.done ? 'text-fg' : 'text-muted')}>{s.label}</p>
                  {s.at && <p className="text-[11px] text-faint">{dateTimeFmt(s.at)}</p>}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-md border border-fg/[0.06] p-4 text-xs leading-relaxed text-muted">
            <p className="mb-1 font-medium text-fg-2">What unlocks after approval</p>
            Buying and selling TSLA, and requesting withdrawals. Deposits only need a verified email.
          </div>
        </Card>
      </div>
    </>
  )
}
