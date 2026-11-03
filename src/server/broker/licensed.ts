import 'server-only'
import type { BrokerAdapter, BrokerMode } from './types'

/**
 * Placeholder for a licensed broker integration (e.g. Alpaca Broker API, DriveWealth).
 *
 * Going live requires, at minimum: a contract with a licensed broker-dealer, their
 * KYC/AML onboarding API (replacing the sandbox KYC flow), a regulated funding rail
 * (e.g. Plaid + ACH via the broker), server-side API credentials in a secrets manager,
 * webhook handling for order/transfer status, and legal/compliance review.
 *
 * Until implemented, every method refuses so the app can never silently behave as if
 * real money moved.
 */
export class UnimplementedLicensedBroker implements BrokerAdapter {
  readonly simulated = false
  readonly label: string
  constructor(readonly mode: Exclude<BrokerMode, 'sandbox'>) {
    this.label = `${mode} (not configured)`
  }
  private refuse(): never {
    throw new Error(`Broker mode "${this.mode}" is not implemented. Set BROKER_MODE=sandbox.`)
  }
  getQuote(): never { return this.refuse() }
  getHistory(): never { return this.refuse() }
  createDeposit(): never { return this.refuse() }
  executeWithdrawal(): never { return this.refuse() }
  placeMarketOrder(): never { return this.refuse() }
}
