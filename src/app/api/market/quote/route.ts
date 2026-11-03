import { route } from '@/server/http'
import { getBroker } from '@/server/broker'

export const GET = route({ auth: 'none', rateLimit: { name: 'quote', limit: 240, windowSeconds: 60 } }, async () => {
  return { quote: await getBroker().getQuote('TSLA') }
})
