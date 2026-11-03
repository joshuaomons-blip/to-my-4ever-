import type { Metadata } from 'next'
import { getSettings } from '@/server/settings'
import { DISCLOSURE } from '@/components/brand'

export const metadata: Metadata = { title: 'Terms of use' }

export default async function TermsPage() {
  const { branding } = await getSettings()
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="eyebrow">Legal · Placeholder</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em]">Terms of use</h1>
      <p className="mt-3 text-xs text-dim">Template text for the sandbox. Replace with counsel-reviewed terms before any production launch.</p>
      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-mute [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-white">
        <h2>1. Sandbox service</h2>
        <p>{branding.platformName} provides an educational simulation. All funds, orders, holdings, deposits and withdrawals are simulated and have no monetary value. No securities are bought or sold and no brokerage relationship is created.</p>
        <h2>2. No affiliation</h2>
        <p>{DISCLOSURE}</p>
        <h2>3. Accounts</h2>
        <p>You are responsible for keeping your credentials secure. We may suspend accounts that abuse the service, attempt to circumvent security controls, or violate these terms.</p>
        <h2>4. No advice</h2>
        <p>Content is general education only and is not personalised investment, tax or legal advice.</p>
        <h2>5. Changes</h2>
        <p>We may update these placeholder terms. Continued use after changes constitutes acceptance.</p>
      </div>
    </article>
  )
}
