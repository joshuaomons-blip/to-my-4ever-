import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { hmacSha256Hex, safeEqual } from '../common/crypto';
import { AppError } from '../common/errors';
import { DbService } from '../database/db.service';
import { JobsService } from '../jobs/jobs.service';
import { FundingService } from '../payments/funding.service';
import { PAYMENT_ADAPTER, PaymentAdapter, PaymentWebhookEvent } from '../payments/payment-adapter';
import { OrdersService } from '../orders/orders.service';

/**
 * Inbound provider events: verify signature → persist raw event (unique per provider event id) →
 * process asynchronously via the durable queue. Providers may deliver duplicates and out of order.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    @Inject(PAYMENT_ADAPTER) private readonly payments: PaymentAdapter,
    private readonly funding: FundingService,
    private readonly orders: OrdersService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async receivePayment(provider: string, headers: Record<string, string | undefined>, raw: Buffer): Promise<{ duplicate: boolean }> {
    if (provider !== this.payments.name) throw new AppError('UNKNOWN_PROVIDER', 'Unknown provider', 404);
    let event: PaymentWebhookEvent;
    try {
      event = this.payments.verifyWebhook(headers, raw);
    } catch (e) {
      this.logger.warn(`rejected ${provider} webhook: ${(e as Error).message}`);
      throw new AppError('INVALID_SIGNATURE', 'Webhook signature verification failed', 401);
    }
    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO webhook_events (provider, provider_event_id, event_type, signature_valid, payload) VALUES ($1,$2,$3,true,$4)
       ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [`payments:${provider}`, event.eventId, event.type, raw.toString('utf8')],
    );
    if (!ins[0]) return { duplicate: true };
    await this.jobs.enqueue(this.db.pool, 'webhooks.process', { webhookEventId: ins[0].id });
    return { duplicate: false };
  }

  /** Generic signed broker notification (for partners that push webhooks). Treated as a hint: we re-fetch state. */
  async receiveBroker(headers: Record<string, string | undefined>, raw: Buffer): Promise<{ duplicate: boolean }> {
    const secret = this.cfg.sandboxBrokerWebhookSecret;
    const sig = headers['x-broker-signature'] ?? '';
    const m = sig.match(/^t=(\d+),v1=([a-f0-9]{64})$/);
    if (!secret || !m || Math.abs(Date.now() / 1000 - Number(m[1])) > 300 || !safeEqual(hmacSha256Hex(secret, `${m[1]}.${raw.toString('utf8')}`), m[2]!)) {
      throw new AppError('INVALID_SIGNATURE', 'Webhook signature verification failed', 401);
    }
    const body = JSON.parse(raw.toString('utf8')) as { eventId: string; type: string; clientOrderId?: string };
    const ins = await this.db.query<{ id: string }>(
      `INSERT INTO webhook_events (provider, provider_event_id, event_type, signature_valid, payload) VALUES ('broker',$1,$2,true,$3)
       ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [body.eventId, body.type, raw.toString('utf8')],
    );
    if (!ins[0]) return { duplicate: true };
    await this.jobs.enqueue(this.db.pool, 'webhooks.process', { webhookEventId: ins[0].id });
    return { duplicate: false };
  }

  async process(webhookEventId: string): Promise<void> {
    const e = await this.db.one<{ id: string; provider: string; payload: Record<string, unknown>; processed_at: Date | null }>(
      'SELECT id, provider, payload, processed_at FROM webhook_events WHERE id = $1',
      [webhookEventId],
    );
    if (!e || e.processed_at) return;
    try {
      if (e.provider.startsWith('payments:')) await this.funding.handlePaymentEvent(e.payload as unknown as PaymentWebhookEvent);
      else if (e.provider === 'broker' && typeof e.payload.clientOrderId === 'string') await this.orders.syncByClientOrderId(e.payload.clientOrderId);
      await this.db.query('UPDATE webhook_events SET processed_at = now(), processing_error = NULL WHERE id = $1', [e.id]);
    } catch (err) {
      await this.db.query('UPDATE webhook_events SET processing_error = $2 WHERE id = $1', [e.id, (err as Error).message]);
      throw err;
    }
  }
}
