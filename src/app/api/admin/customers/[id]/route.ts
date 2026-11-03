import { route, ApiError } from '@/server/http'
import { getCustomerDetail } from '@/server/services/admin'
import { getPortfolio } from '@/server/services/portfolio'

export const GET = route({ auth: 'admin', permission: 'customers:read' }, async ({ params }) => {
  const detail = await getCustomerDetail(params.id)
  if (!detail) throw new ApiError(404, 'Customer not found')
  return { ...detail, portfolio: await getPortfolio(params.id) }
})
