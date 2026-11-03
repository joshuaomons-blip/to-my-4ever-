import 'server-only'
import { randomBytes } from 'node:crypto'
import type { BrokerAdapter } from './types'
import { sandboxHistory, sandboxQuote } from './market'
import { getSettings } from '@/server/settings'

const ref = (p: string) => `SBX-${p}-${randomBytes(6).toString('hex').toUpperCase()}`
const floor6 = (v: number) => Math.floor(v * 1e6) / 1e6

export class SandboxBroker implements BrokerAdapter {
  readonly mode = 'sandbox' as const
  readonly label = 'Sandbox Broker (simulated)'
  readonly simulated = true

  async getQuote(symbol: string) {
    if (symbol !== 'TSLA') throw new Error('Only TSLA is available in the sandbox')
    return sandboxQuote(symbol)
  }

  async getHistory(symbol: string, range: Parameters<BrokerAdapter['getHistory']>[1]) {
    if (symbol !== 'TSLA') throw new Error('Only TSLA is available in the sandbox')
    return sandboxHistory(range)
  }

  async createDeposit() {
    const { trading } = await getSettings()
    return { brokerRef: ref('DEP'), settlesAt: new Date(Date.now() + trading.depositSettlementSeconds * 1000) }
  }

  async executeWithdrawal() {
    return { brokerRef: ref('WDL') }
  }

  async placeMarketOrder(input: Parameters<BrokerAdapter['placeMarketOrder']>[0]) {
    const { price } = await this.getQuote(input.symbol)
    const qty = input.quantity != null ? floor6(input.quantity) : floor6((input.notional ?? 0) / price)
    if (qty <= 0) throw new Error('Order quantity is too small')
    return { brokerRef: ref('ORD'), filledQuantity: qty, filledPrice: price }
  }
}
