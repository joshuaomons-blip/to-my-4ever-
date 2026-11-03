import type { PricePoint, Quote, Range } from './market'

export type BrokerMode = 'sandbox' | 'alpaca' | 'drivewealth'

/**
 * Every deposit, withdrawal and order passes through a BrokerAdapter.
 * The sandbox adapter simulates a broker; live adapters must call a licensed
 * broker-dealer's API from the server only (secrets never reach the browser).
 */
export interface BrokerAdapter {
  readonly mode: BrokerMode
  readonly label: string
  /** True when balances/holdings are simulated. UI must label them accordingly. */
  readonly simulated: boolean

  getQuote(symbol: string): Promise<Quote>
  getHistory(symbol: string, range: Range): Promise<PricePoint[]>

  /** Initiate an inbound transfer. */
  createDeposit(input: { accountNumber: string; amount: number; method: string; reference: string }): Promise<{
    brokerRef: string
    settlesAt: Date
  }>

  /** Initiate an outbound transfer (after internal review approves it). */
  executeWithdrawal(input: { accountNumber: string; amount: number; reference: string }): Promise<{ brokerRef: string }>

  /** Market order by notional (USD) or quantity. Returns the fill. */
  placeMarketOrder(input: {
    accountNumber: string
    symbol: string
    side: 'buy' | 'sell'
    notional?: number
    quantity?: number
    reference: string
  }): Promise<{ brokerRef: string; filledQuantity: number; filledPrice: number }>
}
