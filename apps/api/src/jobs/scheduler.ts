import { Inject, Injectable, Logger } from '@nestjs/common';
import { BROKER_ADAPTER, BrokerAdapter } from '../brokerage/broker-adapter';
import { DbService } from '../database/db.service';
import { JobsService } from './jobs.service';

/** Periodic work, enqueued with dedupe keys so multiple worker replicas never double-schedule. */
@Injectable()
export class Scheduler {
  private readonly logger = new Logger('Scheduler');
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly jobs: JobsService, private readonly db: DbService, @Inject(BROKER_ADAPTER) private readonly broker: BrokerAdapter) {}

  /** One pass of periodic work, for hosts without a long-running worker (e.g. a cron-triggered function). */
  async runDue(): Promise<void> {
    const slot = (ms: number) => Math.floor(Date.now() / ms);
    const q = this.db.pool;
    if (this.broker.isSandbox) await this.jobs.enqueue(q, 'sandbox.partner.tick', {}, { dedupeKey: `tick:${slot(5_000)}`, maxAttempts: 1 });
    const open = await this.db.query<{ id: string }>(
      "SELECT id FROM orders WHERE status IN ('submitted','accepted','partially_filled','pending_cancel') AND updated_at < now() - interval '30 seconds' LIMIT 200",
    );
    for (const o of open) await this.jobs.enqueue(q, 'orders.sync', { orderId: o.id }, { dedupeKey: `order-sync:${o.id}` });
    await this.jobs.enqueue(q, 'ledger.settle', {}, { dedupeKey: `settle:${slot(600_000)}` });
    if (new Date().getUTCHours() === 6) {
      await this.jobs.enqueue(q, 'reconciliation.run', {}, { dedupeKey: `recon:${new Date().toISOString().slice(0, 10)}`, maxAttempts: 3 });
    }
  }

  start(): void {
    const every = (ms: number, fn: () => Promise<void>) => this.timers.push(setInterval(() => fn().catch((e) => this.logger.error((e as Error).message)), ms));
    const slot = (ms: number) => Math.floor(Date.now() / ms);
    if (this.broker.isSandbox) {
      every(5_000, () => this.jobs.enqueue(this.db.pool, 'sandbox.partner.tick', {}, { dedupeKey: `tick:${slot(5_000)}`, maxAttempts: 1 }));
    }
    every(60_000, async () => {
      // Polling fallback for missed partner events: re-sync orders that have been open for a while.
      const open = await this.db.query<{ id: string }>(
        "SELECT id FROM orders WHERE status IN ('submitted','accepted','partially_filled','pending_cancel') AND updated_at < now() - interval '30 seconds' LIMIT 500",
      );
      for (const o of open) await this.jobs.enqueue(this.db.pool, 'orders.sync', { orderId: o.id }, { dedupeKey: `order-sync:${o.id}` });
    });
    every(10 * 60_000, () => this.jobs.enqueue(this.db.pool, 'ledger.settle', {}, { dedupeKey: `settle:${slot(600_000)}` }));
    every(60 * 60_000, async () => {
      const accounts = await this.db.query<{ id: string }>("SELECT id FROM brokerage_accounts WHERE status IN ('active','restricted','submitted','action_required')");
      for (const a of accounts) await this.jobs.enqueue(this.db.pool, 'brokerage.sync_account', { brokerageAccountId: a.id }, { dedupeKey: `sync:${a.id}` });
    });
    every(60 * 60_000, async () => {
      const day = new Date().toISOString().slice(0, 10);
      if (new Date().getUTCHours() === 6) await this.jobs.enqueue(this.db.pool, 'reconciliation.run', {}, { dedupeKey: `recon:${day}`, maxAttempts: 3 });
    });
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}
