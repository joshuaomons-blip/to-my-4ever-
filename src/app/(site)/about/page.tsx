import type { Metadata } from 'next'
import Link from 'next/link'
import { getSettings } from '@/server/settings'
import { paymentsConfig } from '@/server/payments/config'
import { ButtonLink } from '@/components/ui'

export const metadata: Metadata = { title: 'About' }

export default async function AboutPage() {
  const { branding, support } = await getSettings()
  const live = paymentsConfig().livemode
  return (
    <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <h1 className="display text-[40px] leading-[1.05] font-semibold sm:text-[52px]">About {branding.platformName}</h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-fg-2">
            We help people understand Tesla stock and the mechanics of investing before they put real capital at risk.
          </p>
        </div>
        <div className="space-y-10 text-[16px] leading-relaxed text-fg-2">
          <section>
            <h2 className="text-[18px] font-semibold text-fg">An independent platform</h2>
            <p className="mt-2">
              {branding.platformName} is not affiliated with, endorsed by, or operated by Tesla, Inc. We reference Tesla and its ticker, TSLA, only to identify the
              company and the stock we cover. We do not sell shares on Tesla’s behalf, and buying through this website does not create a relationship with Tesla.
            </p>
          </section>
          <section>
            <h2 className="text-[18px] font-semibold text-fg">What you can do here</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Read plain-language material on how stocks, risk and volatility work.</li>
              <li>Follow TSLA through charts, statistics and a company overview.</li>
              <li>Open an account, verify your identity and add funds through our payment provider.</li>
              <li>Practise buying and selling fractional TSLA shares in a simulated portfolio, and track performance and statements.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-[18px] font-semibold text-fg">How money is handled</h2>
            <p className="mt-2">
              Deposits are processed by a regulated payment provider. Your balance is updated only after the provider confirms the payment to us through a signed
              notification, which we then double-check directly with the provider. We never ask for screenshots or receipts as proof of payment, and we never
              store card numbers or bank log-ins.
            </p>
            <p className="mt-3">
              {live
                ? 'Live payments are enabled. Share holdings and orders remain simulated: we do not currently buy real shares on your behalf, and we will say so clearly until a licensed brokerage partner is connected.'
                : 'The platform is in test mode. Payments run through a test provider, balances are simulated and no real money moves.'}
            </p>
          </section>
          <section>
            <h2 className="text-[18px] font-semibold text-fg">Talk to us</h2>
            <p className="mt-2">
              Email <a className="text-fg underline" href={`mailto:${support.email}`}>{support.email}</a>, call {support.phone} ({support.hours}), or open a support request
              from your account. Read our <Link className="text-fg underline" href="/legal/terms">terms</Link> and{' '}
              <Link className="text-fg underline" href="/legal/privacy">privacy policy</Link>.
            </p>
          </section>
          <div className="flex gap-3">
            <ButtonLink href="/register">Open an account</ButtonLink>
            <ButtonLink href="/support" variant="ghost">Contact support</ButtonLink>
          </div>
        </div>
      </div>
    </div>
  )
}
