import 'server-only'
import type { PaymentProvider, ProviderId } from './types'
import { paymentsConfig } from './config'
import { TestPaymentProvider } from './test-provider'
import { StripePaymentProvider } from './stripe-provider'

const cache = new Map<string, PaymentProvider>()

/** The provider currently configured for new deposits. */
export function getPaymentProvider(): PaymentProvider {
  return getProviderById(paymentsConfig().provider)
}

export function getProviderById(id: ProviderId): PaymentProvider {
  const hit = cache.get(id)
  if (hit) return hit
  const p = id === 'stripe' ? new StripePaymentProvider(process.env.STRIPE_SECRET_KEY ?? '', process.env.STRIPE_WEBHOOK_SECRET ?? '') : new TestPaymentProvider()
  cache.set(id, p)
  return p
}

export function getTestProvider(): TestPaymentProvider {
  return getProviderById('test') as TestPaymentProvider
}

export { paymentsConfig } from './config'
export type { PaymentProvider } from './types'
