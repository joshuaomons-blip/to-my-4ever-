import { route } from '@/server/http'
import { listCustomers } from '@/server/services/admin'

export const GET = route({ auth: 'admin', permission: 'customers:read' }, async ({ req }) => {
  const sp = req.nextUrl.searchParams
  return listCustomers({
    q: sp.get('q') ?? undefined,
    status: sp.get('status') ?? undefined,
    kyc: sp.get('kyc') ?? undefined,
    flagged: sp.get('flagged') ?? undefined,
    page: Number(sp.get('page')) || 1,
  })
})
