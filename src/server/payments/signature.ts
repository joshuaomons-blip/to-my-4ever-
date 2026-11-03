import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stripe-style signature: header "t=<unix>,v1=<hex hmac>", HMAC-SHA256 over "<t>.<raw body>".
 * Used for Stripe and, with a different secret, for the built-in test provider.
 */
export function signPayload(secret: string, raw: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

export function verifySignature(secret: string, raw: string, header: string | null, toleranceSeconds = 300): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: 'Webhook secret not configured' }
  if (!header) return { ok: false, reason: 'Missing signature header' }
  const parts = header.split(',').map((p) => p.trim().split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!Number.isFinite(t) || sigs.length === 0) return { ok: false, reason: 'Malformed signature header' }
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return { ok: false, reason: 'Signature timestamp outside tolerance' }
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'))
  const match = sigs.some((s) => {
    const b = Buffer.from(s)
    return b.length === expected.length && timingSafeEqual(b, expected)
  })
  return match ? { ok: true } : { ok: false, reason: 'Signature mismatch' }
}
