import 'server-only'
import { createHash } from 'node:crypto'
import type { ProviderId } from './types'

export type PaymentsConfig = {
  provider: ProviderId
  livemode: boolean
  /** ready: deposits can be created. Otherwise `message` explains what is missing. */
  status: 'ready' | 'misconfigured' | 'blocked'
  message?: string
}

export function testWebhookSecret() {
  return process.env.TEST_PAYMENTS_WEBHOOK_SECRET || createHash('sha256').update('test-provider:' + (process.env.ADMIN_SETUP_TOKEN ?? 'dev')).digest('hex')
}

export function paymentsConfig(): PaymentsConfig {
  const provider = (process.env.PAYMENT_PROVIDER ?? 'test').toLowerCase()
  if (provider === 'stripe') {
    const key = process.env.STRIPE_SECRET_KEY ?? ''
    const livemode = /^(sk|rk)_live_/.test(key)
    if (!/^(sk|rk)_(test|live)_/.test(key) || !(process.env.STRIPE_WEBHOOK_SECRET ?? '').startsWith('whsec_')) {
      return { provider: 'stripe', livemode, status: 'misconfigured', message: 'Stripe is selected but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing or malformed.' }
    }
    if (livemode && process.env.PAYMENTS_LIVE_ENABLED !== 'true') {
      return { provider: 'stripe', livemode, status: 'blocked', message: 'Live Stripe keys detected but PAYMENTS_LIVE_ENABLED is not "true". Live funding stays off until the go-live checklist is complete.' }
    }
    return { provider: 'stripe', livemode, status: 'ready' }
  }
  return { provider: 'test', livemode: false, status: 'ready' }
}

/** Live payments may not run under a brand that uses a third party's trademark. */
export function brandingBlocksLive(platformName: string) {
  return /tesla/i.test(platformName)
}
