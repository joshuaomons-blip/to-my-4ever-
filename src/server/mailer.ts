import 'server-only'
import { prisma } from '@/server/db'

/**
 * Sandbox mailer: emails are written to the OutboxEmail table and shown at /dev/mailbox.
 * Swap this implementation for an SMTP/transactional provider before production.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  await prisma.outboxEmail.create({ data: { to, subject, body } })
  if (process.env.NODE_ENV !== 'production') console.info(`[mail] → ${to}: ${subject}`)
}

export const mailboxEnabled = () => process.env.SANDBOX_MAILBOX !== 'false'
export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
