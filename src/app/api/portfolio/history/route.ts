import { route, ApiError } from '@/server/http'
import { RANGES, type Range } from '@/server/broker'
import { getPortfolioHistory } from '@/server/services/portfolio'

export const GET = route({ auth: 'customer' }, async ({ req, user }) => {
  const range = (req.nextUrl.searchParams.get('range') ?? '1M') as Range
  if (!RANGES.includes(range)) throw new ApiError(400, 'Invalid range')
  return { range, points: await getPortfolioHistory(user.id, range) }
})
