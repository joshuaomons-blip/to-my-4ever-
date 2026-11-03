import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import type { KycStatus } from '@prisma/client'
import { prisma } from '@/server/db'
import { requireAdminPage } from '@/server/auth/session'
import { listKyc } from '@/server/services/admin'
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { ReviewButtons } from '@/components/admin/review'
import { ReasonAction } from '@/components/admin/actions'
import { cn, dateFmt, dateTimeFmt, relTime } from '@/lib/format'

export const metadata: Metadata = { title: 'KYC reviews' }
const TABS: [KycStatus | 'ALL', string][] = [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['ALL', 'All']]

export default async function KycQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage('kyc:review')
  const sp = await searchParams
  const status = (TABS.find(([s]) => s === sp.status)?.[0] ?? 'PENDING') as KycStatus | 'ALL'
  const [rows, counts] = await Promise.all([listKyc(status), prisma.kycSubmission.groupBy({ by: ['status'], _count: true })])
  const count = (s: string) => (s === 'ALL' ? counts.filter((c) => c.status !== 'NOT_STARTED').reduce((a, c) => a + c._count, 0) : (counts.find((c) => c.status === s)?._count ?? 0))
  const notes = await prisma.adminNote.findMany({ where: { context: 'kyc', subjectId: { in: rows.map((r) => r.userId) } }, orderBy: { createdAt: 'desc' }, include: { author: { select: { email: true } } } })

  return (
    <>
      <PageHeader title="Identity reviews" description="Review identity submissions. Submissions never contain ID numbers or document images." />
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <Link key={s} href={`/admin/kyc?status=${s}`} className={cn('rounded-full border px-4 py-1.5 text-sm transition-colors', status === s ? 'border-fg bg-fg text-white' : 'border-fg/10 text-muted hover:text-fg')}>
            {label} <span className="num ml-1 opacity-60">{count(s)}</span>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card><EmptyState icon={<BadgeCheck className="size-5" />} title={status === 'PENDING' ? 'Queue is clear' : 'Nothing here'} description={status === 'PENDING' ? 'There are no submissions waiting for review.' : undefined} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((k) => {
            const kNotes = notes.filter((n) => n.subjectId === k.userId)
            return (
              <Card key={k.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/customers/${k.user.id}`} className="font-medium hover:underline">{k.user.firstName} {k.user.lastName}</Link>
                    <p className="text-xs text-faint">{k.user.email} · joined {dateFmt(k.user.createdAt)}{k.user.isSeed && ' · demo'}</p>
                  </div>
                  <StatusBadge status={k.status} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ['Legal name', k.legalName, k.legalName?.toLowerCase() !== `${k.user.firstName} ${k.user.lastName}`.toLowerCase() ? 'Differs from account name' : null],
                    ['Date of birth', k.dateOfBirth ? dateFmt(k.dateOfBirth) : '—', null],
                    ['Country', k.country, null],
                    ['Document type', k.documentType, null],
                    ['Address', [k.addressLine1, k.city, k.postalCode].filter(Boolean).join(', '), null],
                    ['Occupation · funds', `${k.occupation ?? '—'} · ${k.sourceOfFunds ?? '—'}`, null],
                  ].map(([label, v, warn]) => (
                    <div key={label as string}>
                      <dt className="text-[11px] text-faint">{label}</dt>
                      <dd className="mt-0.5 text-fg-2">{v ?? '—'}</dd>
                      {warn && <p className="text-[11px] text-warn">{warn}</p>}
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[11px] text-faint">
                  Submitted {k.submittedAt ? `${dateTimeFmt(k.submittedAt)} (${relTime(k.submittedAt)})` : '—'}
                  {k.reviewedAt && ` · reviewed ${dateTimeFmt(k.reviewedAt)}${k.reviewer ? ` by ${k.reviewer.email}` : ''}`}
                </p>
                {k.decisionReason && <p className="mt-2 text-xs text-loss">Reason: {k.decisionReason}</p>}
                {kNotes.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-fg/[0.06] pt-4">
                    {kNotes.map((n) => <li key={n.id} className="text-xs text-muted"><span className="text-fg-2">{n.body}</span> · {n.author?.email ?? 'system'} · {relTime(n.createdAt)}</li>)}
                  </ul>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-fg/[0.06] pt-4">
                  {k.status === 'PENDING' && <ReviewButtons kind="kyc" endpoint={`/api/admin/kyc/${k.userId}`} subject={`${k.user.firstName} ${k.user.lastName} · ${k.user.email}`} />}
                  <ReasonAction label="Add review note" title="Internal review note" endpoint={`/api/admin/customers/${k.userId}/notes`} payload={{ context: 'kyc' }} field="body" successMessage="Note added" />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
