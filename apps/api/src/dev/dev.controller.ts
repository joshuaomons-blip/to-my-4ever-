import { Body, CanActivate, Controller, Get, HttpCode, Inject, Injectable, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { APP_CONFIG, AppConfig } from '../config/config';
import { Auth, CustomerGuard } from '../auth/guards';
import { AppError } from '../common/errors';
import { AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';
import { BROKER_ADAPTER, BrokerAdapter } from '../brokerage/broker-adapter';
import { SandboxBrokerAdapter } from '../brokerage/sandbox-broker.adapter';
import { JobsService } from '../jobs/jobs.service';
import { RedisService } from '../redis/redis.service';

/** Only reachable in non-production SANDBOX mode with EXPOSE_DEV_MAILBOX=true (enforced at config load too). */
@Injectable()
class SandboxOnlyGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {}
  canActivate(): boolean {
    if (this.cfg.operatingMode !== 'sandbox' || this.cfg.nodeEnv === 'production' || !this.cfg.exposeDevMailbox) {
      throw new AppError('NOT_FOUND', 'Not found', 404);
    }
    return true;
  }
}

@ApiExcludeController()
@Controller('v1/dev')
@UseGuards(SandboxOnlyGuard)
export class DevController {
  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly redis: RedisService,
    @Inject(BROKER_ADAPTER) private readonly broker: BrokerAdapter,
  ) {}

  private sandbox(): SandboxBrokerAdapter {
    if (!(this.broker instanceof SandboxBrokerAdapter)) throw new AppError('NOT_SANDBOX', 'Sandbox broker not active', 409);
    return this.broker;
  }

  @Get('mailbox')
  mailbox(@Query('to') to: string) {
    return this.db.query('SELECT id, template, subject, body, created_at FROM outbound_emails WHERE to_address = $1 ORDER BY id DESC LIMIT 20', [to]);
  }

  @Post('tick')
  @HttpCode(200)
  async tick() {
    const fills = await this.sandbox().tick();
    const jobs = await this.jobs.drain(50);
    return { sandboxOrdersAdvanced: fills, jobsProcessed: jobs };
  }

  @Post('faults')
  @HttpCode(200)
  async fault(@Body() body: { key: string; value: string | null }) {
    if (!/^(outage|timeout_next_submit|reject_symbol:[A-Z0-9.]{1,12})$/.test(body.key)) throw new AppError('VALIDATION_FAILED', 'Unknown fault', 400);
    await this.sandbox().setFault(body.key, body.value);
    return { ok: true };
  }

  @Post('stale-quote')
  @HttpCode(200)
  async stale(@Body() body: { symbol: string; seconds: number }) {
    if (body.seconds > 0) await this.redis.client.set(`sandbox:md:stale:${body.symbol}`, String(body.seconds), 'EX', 3600);
    else await this.redis.client.del(`sandbox:md:stale:${body.symbol}`);
    await this.redis.client.del(`md:q:${body.symbol}`);
    return { ok: true };
  }

  @Post('dividend')
  @HttpCode(200)
  @UseGuards(CustomerGuard)
  async dividend(@Auth() a: AuthContext, @Body() body: { symbol: string; perShare: string }) {
    const acct = await this.db.one<{ id: string; provider_account_id: string }>('SELECT id, provider_account_id FROM brokerage_accounts WHERE user_id = $1', [a.subjectId]);
    if (!acct) throw new AppError('NOT_FOUND', 'No account', 404);
    const id = await this.sandbox().simulateDividend(acct.provider_account_id, body.symbol, body.perShare);
    await this.jobs.enqueue(this.db.pool, 'brokerage.sync_account', { brokerageAccountId: acct.id });
    await this.jobs.drain(20);
    return { activityId: id };
  }
}
