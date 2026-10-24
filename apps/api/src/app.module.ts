import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { APP_CONFIG, AppConfig, loadConfig } from './config/config';
import { DbService } from './database/db.service';
import { RedisService } from './redis/redis.service';
import { AuditService } from './common/audit.service';
import { GlobalExceptionFilter } from './common/errors';
import { IdempotencyInterceptor } from './common/idempotency';
import { RateLimitGuard } from './common/rate-limit';
import { requestIdMiddleware } from './common/request-context';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CustomerGuard, StaffSessionGuard } from './auth/guards';
import { MfaService } from './auth/mfa.service';
import { SessionService, sessionMiddleware } from './auth/session.service';
import { ControlsService } from './compliance/controls.service';
import { EligibilityService } from './compliance/eligibility.service';
import { MailerService, NotificationService } from './notifications/mailer.service';
import { JobsService } from './jobs/jobs.service';
import { JobHandlers } from './jobs/job-handlers';
import { Scheduler } from './jobs/scheduler';
import { BROKER_ADAPTER, BrokerAdapter } from './brokerage/broker-adapter';
import { SandboxBrokerAdapter } from './brokerage/sandbox-broker.adapter';
import { AlpacaBrokerAdapter } from './brokerage/alpaca-broker.adapter';
import { BrokerageService } from './brokerage/brokerage.service';
import { MARKET_DATA_ADAPTER } from './market-data/market-data.adapter';
import { SandboxMarketDataAdapter } from './market-data/sandbox-market-data';
import { MarketDataService } from './market-data/market-data.service';
import { LedgerService } from './ledger/ledger.service';
import { FeeService } from './fees/fee.service';
import { OrdersService } from './orders/orders.service';
import { OrdersController } from './orders/orders.controller';
import { PAYMENT_ADAPTER } from './payments/payment-adapter';
import { SandboxPaymentAdapter } from './payments/sandbox-payment.adapter';
import { FundingService } from './payments/funding.service';
import { FundingController } from './payments/funding.controller';
import { MonitoringService } from './monitoring/monitoring.service';
import { WebhooksService } from './webhooks/webhooks.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { KYC_ADAPTER, SCREENING_ADAPTER, SandboxKycAdapter, SandboxScreeningAdapter } from './onboarding/kyc.adapter';
import { OnboardingService } from './onboarding/onboarding.service';
import { OnboardingController } from './onboarding/onboarding.controller';
import { InstrumentsController } from './instruments/instruments.controller';
import { PortfolioController } from './portfolio/portfolio.controller';
import { ActivityController } from './activity/activity.controller';
import { SupportController } from './support/support.controller';
import { LegalController } from './legal/legal.controller';
import { HealthController } from './health/health.controller';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { AdminAuthController } from './admin/admin-auth.controller';
import { AdminController } from './admin/admin.controller';
import { PermissionsGuard } from './admin/rbac';
import { DevController } from './dev/dev.controller';

@Module({
  controllers: [
    HealthController, LegalController, AuthController, OnboardingController, InstrumentsController, OrdersController,
    PortfolioController, FundingController, ActivityController, SupportController, WebhooksController,
    AdminAuthController, AdminController, DevController,
  ],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    DbService, RedisService, AuditService, SessionService, AuthService, MfaService, MailerService, NotificationService,
    ControlsService, EligibilityService, JobsService, JobHandlers, Scheduler, BrokerageService, MarketDataService,
    LedgerService, FeeService, OrdersService, FundingService, MonitoringService, WebhooksService, OnboardingService,
    ReconciliationService, CustomerGuard, StaffSessionGuard, PermissionsGuard,
    {
      provide: BROKER_ADAPTER,
      inject: [APP_CONFIG, DbService],
      useFactory: (cfg: AppConfig, db: DbService): BrokerAdapter =>
        cfg.brokerProvider === 'alpaca'
          ? new AlpacaBrokerAdapter({ baseUrl: cfg.alpaca.baseUrl, apiKey: cfg.alpaca.apiKey!, apiSecret: cfg.alpaca.apiSecret!, firmAccountId: process.env.ALPACA_FIRM_ACCOUNT_ID })
          : new SandboxBrokerAdapter(db),
    },
    { provide: MARKET_DATA_ADAPTER, inject: [RedisService], useFactory: (r: RedisService) => new SandboxMarketDataAdapter(r) },
    {
      provide: PAYMENT_ADAPTER,
      inject: [APP_CONFIG, JobsService, DbService],
      useFactory: (cfg: AppConfig, jobs: JobsService, db: DbService) =>
        new SandboxPaymentAdapter(cfg.sandboxPaymentWebhookSecret, (raw, signature, delaySeconds) =>
          jobs.enqueue(db.pool, 'sandbox.payments.deliver', { raw, signature }, { delaySeconds }),
        ),
    },
    { provide: KYC_ADAPTER, useFactory: () => new SandboxKycAdapter() },
    { provide: SCREENING_ADAPTER, useFactory: () => new SandboxScreeningAdapter() },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly sessions: SessionService) {}

  configure(consumer: MiddlewareConsumer): void {
    const cfg = loadConfig();
    consumer.apply(requestIdMiddleware, sessionMiddleware(this.sessions, cfg)).forRoutes('*');
  }
}
