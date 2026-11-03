import type { Metadata } from 'next'
import { getSettings } from '@/server/settings'

export const metadata: Metadata = { title: 'Privacy policy' }

export default async function PrivacyPage() {
  const { branding, support } = await getSettings()
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="eyebrow">Legal · Placeholder</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em]">Privacy policy</h1>
      <p className="mt-3 text-xs text-dim">Template text for the sandbox. Replace with a reviewed policy before any production launch.</p>
      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-mute [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-white">
        <h2>What we collect</h2>
        <p>Account details (name, email, optional phone), sandbox verification answers (legal name, date of birth, address, document type), simulated transactions, and security logs (IP address, browser, sign-in times).</p>
        <h2>What we never collect</h2>
        <p>{branding.platformName} does not collect or store bank account credentials, payment card numbers, government identification numbers, or identity document images.</p>
        <h2>How we use it</h2>
        <p>To operate the sandbox, secure accounts, prevent abuse, and maintain an audit trail of administrative actions.</p>
        <h2>Security</h2>
        <p>Passwords are hashed with scrypt. Sessions use secure, HTTP-only cookies. Administrative actions are logged.</p>
        <h2>Contact</h2>
        <p>Questions: {support.email}</p>
      </div>
    </article>
  )
}
