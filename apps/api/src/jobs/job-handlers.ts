import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BROKER_ADAPTER, BrokerAdapter } from '../brokerage/broker-adapter';
import { BrokerageService } from '../brokerage/brokerage.service';
import { SandboxBrokerAdapter } from '../brokerage/sandbox-broker.adapter';
import { DbService } from '../database/db.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { OrdersService } from '../orders/orders.service';
import { FundingService } from '../payments/funding.service';
import { SANDBOX_SIGNATURE_HEADER } from '../payments/sandbox-payment.adapter';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { JobsService } from './jobs.service';

const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('invalid job payload');
  return v;
};

/** Registers every durable job handler. Used by both the API process (optional) and the worker. */
@Injectable()
export class JobHandlers implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly db: DbService,
    private readonly onboarding: OnboardingService,
    private readonly brokerage: BrokerageService,
    private readonly orders: OrdersService,
    private readonly funding: FundingService,
    private readonly webhooks: WebhooksService,
    private readonly recon: ReconciliationService,
    @Inject(BROKER_ADAPTER) private readonly broker: BrokerAdapter,
  ) {}

  onModuleInit(): void {
    const j = this.jobs;
    j.register('onboarding.verify', (p) => this.onboarding.verify(str(p.userId)));
    j.register('brokerage.open_account', (p) => this.brokerage.openAccount(str(p.userId)));
    j.register('brokerage.sync_account', (p) => this.brokerage.syncAccount(str(p.brokerageAccountId)));
    j.register('orders.resolve_submission', (p, job) => this.orders.resolveSubmission(str(p.orderId), job.attempts));
    j.register('orders.sync', (p) => this.orders.sync(str(p.orderId)));
    j.register('orders.sync_client', (p) => this.orders.syncByClientOrderId(str(p.clientOrderId)));
    j.register('orders.cancel', (p) => this.orders.retryCancel(str(p.orderId)));
    j.register('fees.collect', (p) => this.orders.collectFee(str(p.executionId)));
    j.register('deposits.settle', (p) => this.funding.settleDeposit(str(p.depositId)));
    j.register('withdrawals.process', (p) => this.funding.processWithdrawal(str(p.withdrawalId)));
    j.register('withdrawals.return_funds', (p) => this.funding.returnWithdrawalFunds(str(p.withdrawalId)));
    j.register('webhooks.process', (p) => this.webhooks.process(str(p.webhookEventId)));
    j.register('ledger.settle', async () => void (await this.orders.settleExecutions()));
    j.register('reconciliation.run', async () => void (await this.recon.run()));
    j.register('sandbox.payments.deliver', async (p) => {
      await this.webhooks.receivePayment('sandbox', { [SANDBOX_SIGNATURE_HEADER]: str(p.signature) }, Buffer.from(str(p.raw)));
    });
    j.register('sandbox.partner.tick', async () => {
      if (this.broker instanceof SandboxBrokerAdapter) await this.broker.tick();
    });
    if (this.broker instanceof SandboxBrokerAdapter) {
      // Simulates the partner pushing order updates: each event schedules an authoritative re-fetch.
      this.broker.setEventSink(async (e) => {
        if (e.type === 'order_updated') {
          await this.jobs.enqueue(this.db.pool, 'orders.sync_client', { clientOrderId: e.clientOrderId });
        }
      });
    }
  }
}
