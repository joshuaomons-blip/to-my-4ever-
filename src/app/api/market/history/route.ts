import { route, ApiError } from '@/server/http'
import { getBroker, RANGES, type Range } from '@/server/broker'

export const GET = route({ auth: 'none', rateLimit: { name: 'history', limit: 240, windowSeconds: 60 } }, async ({ req }) => {
  const range = (req.nextUrl.searchParams.get('range') ?? '1M') as Range
  if (!RANGES.includes(range)) throw new ApiError(400, 'Invalid range')
  return { range, points: await getBroker().getHistory('TSLA', range) }
})
