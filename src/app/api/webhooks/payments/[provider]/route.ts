import { NextResponse, type NextRequest } from 'next/server'
import { processWebhook } from '@/server/payments/service'
import { rateLimit } from '@/server/security/rateLimit'

/**
 * Payment-provider webhooks: POST /api/webhooks/payments/stripe (or /test).
 * The raw body is passed unparsed to signature verification.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (provider !== 'stripe' && provider !== 'test') return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local').trim()
  if (!(await rateLimit(`webhook:${provider}:${ip}`, 600, 60))) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  const raw = await req.text()
  if (raw.length > 512_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  try {
    const result = await processWebhook(provider, raw, req.headers)
    return NextResponse.json(result.body, { status: result.status })
  } catch (e) {
    console.error('[webhook]', provider, e)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
