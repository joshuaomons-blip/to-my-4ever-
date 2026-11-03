import 'server-only'
import type { BrokerAdapter } from './types'
import { SandboxBroker } from './sandbox'
import { UnimplementedLicensedBroker } from './licensed'

let instance: BrokerAdapter | null = null

export function getBroker(): BrokerAdapter {
  if (instance) return instance
  const mode = (process.env.BROKER_MODE ?? 'sandbox').toLowerCase()
  if (mode === 'alpaca' || mode === 'drivewealth') instance = new UnimplementedLicensedBroker(mode)
  else instance = new SandboxBroker()
  return instance
}

export type { BrokerAdapter } from './types'
export type { Quote, Range, PricePoint } from './market'
export { RANGES } from './market'
