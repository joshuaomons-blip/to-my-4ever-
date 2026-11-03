import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/server/db'
import { requireCustomerPage } from '@/server/auth/session'
import { getSettings } from '@/server/settings'
import { paymentsConfig } from '@/server/payments/config'
import { Card } from '@/components/ui'
import { TestCheckout } from '@/components/app/deposit-forms'

export const metadata: Metadata = { title: 'Test payment' }

/** Stand-in for a provider's hosted card checkout. Only exists while the test provider is active. */
export default async function TestCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  if (paymentsConfig().provider !== 'test') notFound()
  const user = await requireCustomerPage()
  const { id } = await params
  const d = await prisma.depositRequest.findFirst({ where: { id, userId: user.id, provider: 'test', method: 'CARD' } })
  if (!d) notFound()
  if (d.status !== 'AWAITING_PAYMENT') redirect(`/account/funding/${d.id}`)
  const { branding } = await getSettings()
  return (
    <div className="mx-auto max-w-md">
      <Card className="p-7">
        <TestCheckout id={d.id} amount={Number(d.amount)} reference={d.reference} merchant={branding.platformName} />
      </Card>
    </div>
  )
}
