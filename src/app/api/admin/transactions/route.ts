import { route } from '@/server/http'
import { listTransactions } from '@/server/services/admin'

export const GET = route({ auth: 'admin', permission: 'transactions:read' }, async ({ req }) => {
  const sp = req.nextUrl.searchParams
  const get = (k: string) => sp.get(k) ?? undefined
  return listTransactions({ q: get('q'), type: get('type'), status: get('status'), from: get('from'), to: get('to'), page: Number(sp.get('page')) || 1 })
})
