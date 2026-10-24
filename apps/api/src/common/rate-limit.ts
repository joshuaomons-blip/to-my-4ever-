import { CanActivate, ExecutionContext, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import { AppError } from './errors';
import { AppRequest } from './request-context';

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
  /** 'ip' (default), 'subject' (authenticated user/staff), or 'ip+body:<field>' */
  by?: 'ip' | 'subject' | `ip+body:${string}`;
  /** Deny when Redis is unavailable (use for authentication & money movement). */
  failClosed?: boolean;
}

const RATE_LIMIT_KEY = 'rate_limit_rules';
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);

const DEFAULT_RULE: RateLimitRule = { name: 'global', limit: 300, windowSeconds: 60, by: 'ip' };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const rules = this.reflector.getAllAndOverride<RateLimitRule[]>(RATE_LIMIT_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    for (const rule of [DEFAULT_RULE, ...rules]) {
      const key = `rl:${rule.name}:${this.identity(req, rule)}:${Math.floor(Date.now() / 1000 / rule.windowSeconds)}`;
      try {
        const count = await this.redis.client.multi().incr(key).expire(key, rule.windowSeconds + 1).exec();
        const n = Number(count?.[0]?.[1] ?? 0);
        if (n > rule.limit * this.cfg.rateLimitMultiplier) {
          throw new AppError('RATE_LIMITED', 'Too many requests. Please wait and try again.', 429, {
            retryAfterSeconds: rule.windowSeconds,
          });
        }
      } catch (e) {
        if (e instanceof AppError) throw e;
        this.logger.warn(`rate limiter unavailable for ${rule.name}: ${(e as Error).message}`);
        if (rule.failClosed) throw new AppError('SERVICE_UNAVAILABLE', 'Temporarily unavailable', 503);
      }
    }
    return true;
  }

  private identity(req: AppRequest, rule: RateLimitRule): string {
    const by = rule.by ?? 'ip';
    if (by === 'subject') return req.auth?.subjectId ?? `ip:${req.ip}`;
    if (by.startsWith('ip+body:')) {
      const field = by.slice('ip+body:'.length);
      const v = String((req.body as Record<string, unknown> | undefined)?.[field] ?? '').toLowerCase().slice(0, 200);
      return `${req.ip}:${v}`;
    }
    return req.ip ?? 'unknown';
  }
}
