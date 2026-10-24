import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, AppConfig } from '../config/config';
import { DbService } from '../database/db.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../common/errors';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly db: DbService, private readonly redis: RedisService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  /** Liveness: process is up. */
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable. Used by the load balancer. */
  @Get('readyz')
  async ready() {
    const checks: Record<string, boolean> = {};
    checks.database = await this.db.query('SELECT 1').then(() => true, () => false);
    checks.redis = await this.redis.client.ping().then(() => true, () => false);
    const ok = checks.database; // redis degradation is tolerated (rate limiter fails closed only on sensitive routes)
    if (!ok) throw new AppError('NOT_READY', 'Dependencies unavailable', 503, checks);
    return { status: 'ready', mode: this.cfg.operatingMode, checks };
  }
}
