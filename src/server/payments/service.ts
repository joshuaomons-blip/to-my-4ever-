import 'server-only'
import { Prisma, type DepositRequest, type PaymentMethod } from '@prisma/client'
import { prisma } from '@/server/db'
import { ApiError } from '@/server/http'
import { audit } from '@/server/audit'
import { getSettings } from '@/server/settings'
import { makeReference } from '@/server/security/crypto'
import type { SafeUser } from '@/server/auth/session'
import { ensureAccount } from '@/server/services/ledger'
import { getPaymentProvider, getProviderById } from './index'
import { brandingBlocksLive, paymentsConfig } from './config'
import type { ProviderId, ProviderSessionState } from './types'

const D = (n: number) => new Prisma.Decimal(n.toFixed(2))
const OPEN: DepositRequest['status'][] = ['AWAITING_PAYMENT', 'PROCESSING']
export const METHOD_LABEL: Record<PaymentMethod, string> = { BANK_TRANSFER: 'Bank transfer', CARD: 'Card payment' }

export type DepositDTO = {
  id: string
  reference: string
  provider: string
  livemode: boolean
  method: PaymentMethod
  amount: number
  receivedAmount: number | null
  currency: string
  status: DepositRequest['status']
  checkoutUrl: string | null
  instructions: Record<string, string> | null
  failureReason: string | null
  isSeed: boolean
  expiresAt: string
  succeededAt: string | null
  failedAt: string | null
  createdAt: string
}

export function toDepositDTO(d: DepositRequest): DepositDTO {
  return {
    id: d.id,
    reference: d.reference,
    provider: d.provider,
    livemode: d.livemode,
    method: d.method,
    amount: Number(d.amount),
    receivedAmount: d.receivedAmount == null ? null : Number(d.receivedAmount),
    currency: d.currency,
    status: d.status,
    checkoutUrl: d.checkoutUrl,
    instructions: (d.instructions as Record<string, string> | null) ?? null,
    failureReason: d.failureReason,
    isSeed: d.isSeed,
    expiresAt: d.expiresAt.toISOString(),
    succeededAt: d.succeededAt?.toISOString() ?? null,
    failedAt: d.failedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  }
}

/** Funding availability for the current configuration, with a reason when unavailable. */
export async function fundingAvailability() {
  const cfg = paymentsConfig()
  const settings = await getSettings()
  if (cfg.status !== 'ready') return { ...cfg, available: false as const }
  if (cfg.livemode && brandingBlocksLive(settings.branding.platformName)) {
    return { ...cfg, available: false as const, status: 'blocked' as const, message: 'Live payments are disabled while the platform name uses a third-party trademark. Rename the platform in Settings first.' }
  }
  return { ...cfg, available: true as const }
}

/** Expire unpaid deposit requests whose payment window has closed. */
export async function sweepDeposits(userId?: string) {
  await prisma.depositRequest.updateMany({
    where: { status: 'AWAITING_PAYMENT', expiresAt: { lt: new Date() }, ...(userId ? { userId } : {}) },
    data: { status: 'EXPIRED', failureReason: 'Payment window expired', failedAt: new Date() },
  })
}

export async function createDeposit(user: SafeUser, input: { amount: number; method: PaymentMethod; idempotencyKey: string }, ip: string) {
  const availability = await fundingAvailability()
  if (!availability.available) throw new ApiError(503, availability.message ?? 'Funding is unavailable')
  const settings = await getSettings()
  if (settings.maintenance.enabled) throw new ApiError(503, settings.maintenance.message)
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'Your account is suspended. Contact support.')
  if (!user.emailVerifiedAt) throw new ApiError(403, 'Verify your email address before adding funds.')
  if (availability.livemode) {
    const kyc = await prisma.kycSubmission.findUnique({ where: { userId: user.id }, select: { status: true } })
    if (kyc?.status !== 'APPROVED') throw new ApiError(403, 'Identity verification must be approved before you can add real funds.')
  }
  const { minDeposit, maxDeposit } = settings.trading
  if (input.amount < minDeposit) throw new ApiError(422, `The minimum deposit is $${minDeposit}`, { amount: `Minimum is $${minDeposit}` })
  if (input.amount > maxDeposit) throw new ApiError(422, `The maximum deposit is $${maxDeposit.toLocaleString()}`, { amount: `Maximum is $${maxDeposit.toLocaleString()}` })

  const provider = getPaymentProvider()
  if (!provider.methods.includes(input.method)) throw new ApiError(422, 'That payment method is not supported by the current provider')

  // Duplicate-submission protection: the same idempotency key returns the same request.
  const existing = await prisma.depositRequest.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } } })
  if (existing) return existing

  await sweepDeposits(user.id)
  const open = await prisma.depositRequest.count({ where: { userId: user.id, status: { in: OPEN } } })
  if (open >= 5) throw new ApiError(429, 'You have 5 deposits in progress. Complete or cancel one before starting another.')

  await ensureAccount(user.id)
  let deposit: DepositRequest
  try {
    deposit = await prisma.depositRequest.create({
      data: {
        reference: makeReference('DEP'),
        userId: user.id,
        provider: provider.id,
        livemode: provider.livemode,
        method: input.method,
        amount: D(input.amount),
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.depositRequest.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } } })
    }
    throw e
  }

  try {
    const session = await provider.createCheckout({
      depositId: deposit.id,
      reference: deposit.reference,
      amount: input.amount,
      currency: deposit.currency,
      method: input.method,
      customer: { email: user.email, name: `${user.firstName} ${user.lastName}` },
    })
    deposit = await prisma.depositRequest.update({
      where: { id: deposit.id },
      data: { providerSessionId: session.sessionId, checkoutUrl: session.checkoutUrl ?? null, instructions: session.instructions ?? Prisma.JsonNull, expiresAt: session.expiresAt },
    })
  } catch (e) {
    await prisma.depositRequest.update({ where: { id: deposit.id }, data: { status: 'FAILED', failureReason: 'Payment provider could not start the payment', failedAt: new Date() } })
    console.error('[payments] createCheckout failed', e)
    throw new ApiError(502, 'The payment provider could not start this payment. Try again shortly.')
  }
  await audit({ actor: user, action: 'deposit.created', targetType: 'deposit', targetId: deposit.id, metadata: { reference: deposit.reference, amount: input.amount, method: input.method, provider: provider.id, livemode: provider.livemode }, ip })
  return deposit
}

export async function cancelDeposit(user: SafeUser, id: string, ip: string) {
  const d = await prisma.depositRequest.findFirst({ where: { id, userId: user.id } })
  if (!d) throw new ApiError(404, 'Deposit not found')
  const claimed = await prisma.depositRequest.updateMany({ where: { id, status: 'AWAITING_PAYMENT' }, data: { status: 'CANCELLED', failedAt: new Date(), failureReason: 'Cancelled by customer' } })
  if (claimed.count !== 1) throw new ApiError(409, 'Only deposits that are still awaiting payment can be cancelled')
  if (d.providerSessionId) await getProviderById(d.provider as ProviderId).cancelSession?.(d.providerSessionId)
  await audit({ actor: user, action: 'deposit.cancelled', targetType: 'deposit', targetId: id, ip })
}

/**
 * Apply the provider's own view of a session to a deposit. This is the ONLY code
 * path that credits an account, and it runs only with state fetched from the provider.
 */
async function applyProviderState(deposit: DepositRequest, state: ProviderSessionState): Promise<{ outcome: 'processed' | 'duplicate' | 'ignored' | 'rejected'; message: string }> {
  if (state.livemode !== deposit.livemode) return { outcome: 'rejected', message: 'Live/test mode mismatch between provider and deposit' }

  if (state.status === 'succeeded') {
    if (!state.amount || state.amount <= 0) return { outcome: 'rejected', message: 'Provider reported no amount' }
    if (state.currency && state.currency.toLowerCase() !== deposit.currency) return { outcome: 'rejected', message: `Currency mismatch (${state.currency})` }
    const received = Math.round(state.amount * 100) / 100
    const credited = await prisma.$transaction(async (db) => {
      const claimed = await db.depositRequest.updateMany({
        where: { id: deposit.id, status: { in: OPEN } },
        data: { status: 'SUCCEEDED', receivedAmount: D(received), providerPaymentId: state.paymentId ?? null, succeededAt: new Date(), failureReason: null },
      })
      if (claimed.count !== 1) return false
      const tx = await db.transaction.create({
        data: {
          reference: deposit.reference,
          userId: deposit.userId,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount: D(received),
          method: `${METHOD_LABEL[deposit.method]} · ${deposit.provider === 'test' ? 'test provider' : 'Stripe'}`,
          brokerRef: state.paymentId ?? null,
          brokerMode: deposit.provider,
          livemode: deposit.livemode,
          completedAt: new Date(),
        },
      })
      await db.depositRequest.update({ where: { id: deposit.id }, data: { transactionId: tx.id } })
      await db.account.update({ where: { userId: deposit.userId }, data: { cashBalance: { increment: D(received) } } })
      await db.notification.create({
        data: {
          userId: deposit.userId,
          title: 'Deposit received',
          body: `$${received.toFixed(2)} (${deposit.reference}) has been confirmed by the payment provider and added to your cash balance.`,
          level: 'success',
        },
      })
      return true
    })
    if (!credited) return { outcome: 'duplicate', message: 'Deposit already finalised' }
    const note = Math.abs(received - Number(deposit.amount)) > 0.009 ? ` (expected ${Number(deposit.amount).toFixed(2)}, credited amount received)` : ''
    return { outcome: 'processed', message: `Credited ${received.toFixed(2)}${note}` }
  }

  if (state.status === 'processing') {
    const r = await prisma.depositRequest.updateMany({ where: { id: deposit.id, status: 'AWAITING_PAYMENT' }, data: { status: 'PROCESSING' } })
    return r.count ? { outcome: 'processed', message: 'Payment is processing' } : { outcome: 'ignored', message: 'No state change' }
  }

  if (state.status === 'failed' || state.status === 'expired') {
    const r = await prisma.depositRequest.updateMany({
      where: { id: deposit.id, status: { in: OPEN } },
      data: { status: state.status === 'failed' ? 'FAILED' : 'EXPIRED', failureReason: state.failureReason ?? (state.status === 'expired' ? 'Payment window expired' : 'Payment failed'), failedAt: new Date() },
    })
    if (r.count && state.status === 'failed') {
      await prisma.notification.create({ data: { userId: deposit.userId, title: 'Deposit failed', body: `${deposit.reference}: ${state.failureReason ?? 'the payment did not complete'}. No money was added. You can try again.`, level: 'warning' } })
    }
    return r.count ? { outcome: 'processed', message: state.failureReason ?? state.status } : { outcome: 'ignored', message: 'Deposit already finalised' }
  }

  return { outcome: 'rejected', message: 'Event claims a payment the provider does not confirm' }
}

/** Entry point for provider webhooks (HTTP route and the test-mode simulator). */
export async function processWebhook(providerId: ProviderId, raw: string, headers: Headers): Promise<{ status: number; body: Record<string, unknown> }> {
  const active = paymentsConfig().provider
  if (providerId !== active) return { status: 404, body: { error: 'Provider not enabled' } }
  const provider = getProviderById(providerId)
  const verified = provider.verifyWebhook(raw, headers)
  if (!verified.ok) {
    await audit({ action: 'payment.webhook_rejected', metadata: { provider: providerId, reason: verified.reason } })
    return { status: 400, body: { error: verified.reason } }
  }
  const { event } = verified
  const deposit = event.sessionId ? await prisma.depositRequest.findUnique({ where: { providerSessionId: event.sessionId } }) : null

  // Fast path for provider retries; the unique constraint below still guards concurrent duplicates.
  if (await prisma.paymentEvent.findUnique({ where: { provider_eventId: { provider: providerId, eventId: event.eventId } }, select: { id: true } })) {
    return { status: 200, body: { received: true, duplicate: true } }
  }
  let record
  try {
    record = await prisma.paymentEvent.create({
      data: { provider: providerId, eventId: event.eventId, type: event.type, depositId: deposit?.id, signatureValid: true, outcome: 'received', payload: event.payload as Prisma.InputJsonValue },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { status: 200, body: { received: true, duplicate: true } }
    throw e
  }

  if (!deposit) {
    await prisma.paymentEvent.update({ where: { id: record.id }, data: { outcome: 'ignored', message: 'No matching deposit' } })
    return { status: 200, body: { received: true, ignored: true } }
  }

  try {
    const state = await provider.retrieveSession(deposit.providerSessionId!)
    const result = await applyProviderState(deposit, state)
    await prisma.paymentEvent.update({ where: { id: record.id }, data: { verified: true, outcome: result.outcome, message: result.message } })
    await audit({ action: `deposit.webhook_${result.outcome}`, targetType: 'deposit', targetId: deposit.id, metadata: { reference: deposit.reference, event: event.type, message: result.message } })
    return { status: 200, body: { received: true, outcome: result.outcome } }
  } catch (e) {
    await prisma.paymentEvent.update({ where: { id: record.id }, data: { outcome: 'error', message: (e as Error).message.slice(0, 300) } })
    // Non-2xx tells the provider to retry later.
    return { status: 500, body: { error: 'Verification failed; will retry' } }
  }
}

/** Admin action: re-read a deposit's status from the provider (no manual crediting exists). */
export async function reverifyDeposit(admin: SafeUser, id: string, ip: string) {
  const deposit = await prisma.depositRequest.findUnique({ where: { id } })
  if (!deposit) throw new ApiError(404, 'Deposit not found')
  if (!deposit.providerSessionId) throw new ApiError(409, 'This deposit has no provider session')
  const state = await getProviderById(deposit.provider as ProviderId).retrieveSession(deposit.providerSessionId)
  const result = await applyProviderState(deposit, state)
  await prisma.paymentEvent.create({
    data: { provider: deposit.provider, eventId: `reverify_${deposit.id}_${Date.now()}`, type: 'admin.reverify', depositId: deposit.id, signatureValid: false, verified: true, outcome: result.outcome, message: result.message, payload: { by: admin.email, providerStatus: state.status } },
  })
  await audit({ actor: admin, action: 'deposit.reverified', targetType: 'deposit', targetId: id, metadata: { providerStatus: state.status, outcome: result.outcome }, ip })
  return { providerStatus: state.status, ...result }
}

/**
 * Return funds for an approved live withdrawal to the customer's original payment
 * methods (refund-to-source), newest deposits first.
 */
export async function refundToSource(userId: string, amount: number, reference: string) {
  const deposits = await prisma.depositRequest.findMany({ where: { userId, status: 'SUCCEEDED', livemode: true, providerPaymentId: { not: null } }, orderBy: { succeededAt: 'desc' } })
  const available = deposits.reduce((a, d) => a + Number(d.receivedAmount ?? 0) - Number(d.refundedAmount), 0)
  if (available + 0.001 < amount) throw new ApiError(409, 'Not enough refundable deposits to return this amount to the original payment method')
  let remaining = amount
  const refunds: string[] = []
  for (const d of deposits) {
    if (remaining <= 0.001) break
    const room = Number(d.receivedAmount ?? 0) - Number(d.refundedAmount)
    if (room <= 0) continue
    const part = Math.round(Math.min(room, remaining) * 100) / 100
    const { refundId } = await getProviderById(d.provider as ProviderId).refund({ paymentId: d.providerPaymentId!, amount: part, reference })
    await prisma.depositRequest.update({ where: { id: d.id }, data: { refundedAmount: { increment: D(part) } } })
    refunds.push(refundId)
    remaining = Math.round((remaining - part) * 100) / 100
  }
  return refunds.join(',')
}
