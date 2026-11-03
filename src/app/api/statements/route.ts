import { route, ApiError } from '@/server/http'
import { buildStatementPdf, type StatementKind } from '@/server/services/statements'
import { audit } from '@/server/audit'

export const GET = route({ auth: 'customer', rateLimit: { name: 'statement', limit: 20, windowSeconds: 300 } }, async ({ req, user, ip }) => {
  const sp = req.nextUrl.searchParams
  const kind = (sp.get('kind') ?? 'summary') as StatementKind
  if (kind !== 'summary' && kind !== 'transactions') throw new ApiError(400, 'Invalid statement type')
  const from = new Date(sp.get('from') ?? Date.now() - 30 * 86_400_000)
  const toRaw = new Date(sp.get('to') ?? Date.now())
  if (isNaN(from.getTime()) || isNaN(toRaw.getTime()) || from > toRaw) throw new ApiError(400, 'Invalid date range')
  const to = new Date(Math.min(toRaw.getTime() + 86_399_999, Date.now()))
  const bytes = await buildStatementPdf(user.id, { kind, from, to })
  await audit({ actor: user, action: 'statement.downloaded', targetType: 'user', targetId: user.id, metadata: { kind, from: from.toISOString(), to: to.toISOString() }, ip })
  const name = `sandbox-${kind}-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.pdf`
  return new Response(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
})
