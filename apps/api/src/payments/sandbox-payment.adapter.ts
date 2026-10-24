import { randomUUID } from 'crypto';
import { hmacSha256Hex, safeEqual } from '../common/crypto';
import { PaymentAdapter, PaymentMethodInput, PaymentWebhookEvent, ProviderPayment, ProviderPaymentMethod } from './payment-adapter';

export const SANDBOX_SIGNATURE_HEADER = 'x-sandbox-signature';
const TOLERANCE_SECONDS = 300;

export function signSandboxWebhook(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}

/** Amounts whose minor-unit remainder mod 100 equals 13 fail (sandbox rule for testing failed payments). */
export const sandboxShouldFail = (amountMinor: bigint): boolean => amountMinor % 100n === 13n;

/**
 * SANDBOX payment provider. No money moves. Outcomes are delivered as SIGNED webhooks through the same
 * verification path used for real providers (scheduler: `deliver` callback, wired to the webhook processor).
 */
export class SandboxPaymentAdapter implements PaymentAdapter {
  readonly name = 'sandbox';
  readonly isSandbox = true;

  constructor(
    private readonly secret: string,
    private readonly deliver: (rawBody: string, signature: string, delaySeconds: number) => Promise<void>,
  ) {}

  async addPaymentMethod(_input: PaymentMethodInput): Promise<ProviderPaymentMethod> {
    // Real providers verify ownership (open banking, micro-deposits, card 3DS). Sandbox: instantly verified.
    return { providerMethodId: `sbx-pm-${randomUUID()}`, verified: true };
  }

  private async schedule(type: PaymentWebhookEvent['type'], providerId: string, failureReason?: string) {
    const event: PaymentWebhookEvent = { eventId: `sbx-evt-${randomUUID()}`, type, providerId, failureReason, occurredAt: new Date().toISOString() };
    const raw = JSON.stringify(event);
    await this.deliver(raw, signSandboxWebhook(this.secret, raw), 1);
  }

  async createDeposit(input: { reference: string; amountMinor: bigint }): Promise<ProviderPayment> {
    const id = `sbx-pay-${randomUUID()}`;
    if (sandboxShouldFail(input.amountMinor)) await this.schedule('payment.failed', id, 'Insufficient funds at source bank (sandbox)');
    else await this.schedule('payment.succeeded', id);
    return { providerId: id, status: 'pending', nextAction: null };
  }

  async createPayout(input: { reference: string; amountMinor: bigint }): Promise<ProviderPayment> {
    const id = `sbx-po-${randomUUID()}`;
    if (sandboxShouldFail(input.amountMinor)) await this.schedule('payout.failed', id, 'Beneficiary account closed (sandbox)');
    else await this.schedule('payout.completed', id);
    return { providerId: id, status: 'pending' };
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: Buffer): PaymentWebhookEvent {
    const sig = headers[SANDBOX_SIGNATURE_HEADER];
    const m = sig?.match(/^t=(\d+),v1=([a-f0-9]{64})$/);
    if (!m) throw new Error('missing or malformed signature');
    const ts = Number(m[1]);
    if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) throw new Error('signature timestamp outside tolerance');
    const expected = hmacSha256Hex(this.secret, `${ts}.${rawBody.toString('utf8')}`);
    if (!safeEqual(expected, m[2]!)) throw new Error('signature mismatch');
    const e = JSON.parse(rawBody.toString('utf8')) as PaymentWebhookEvent;
    if (!e.eventId || !e.type || !e.providerId) throw new Error('invalid event payload');
    return e;
  }
}
