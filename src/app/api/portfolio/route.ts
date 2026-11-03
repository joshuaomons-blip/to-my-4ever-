import { route } from '@/server/http'
import { getPortfolio } from '@/server/services/portfolio'

export const GET = route({ auth: 'customer' }, async ({ user }) => ({ portfolio: await getPortfolio(user.id) }))
