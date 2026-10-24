import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { RateLimit } from '../common/rate-limit';
import { AppRequest } from '../common/request-context';
import { WebhooksService } from './webhooks.service';

/** Inbound provider webhooks. Authenticated by signature, not session; raw body preserved for verification. */
@ApiExcludeController()
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  private headers(req: AppRequest): Record<string, string | undefined> {
    return Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
  }

  @Post('payments/:provider')
  @HttpCode(200)
  @RateLimit({ name: 'webhook-payments', limit: 600, windowSeconds: 60 })
  async payments(@Param('provider') provider: string, @Req() req: AppRequest) {
    return this.webhooks.receivePayment(provider, this.headers(req), req.rawBody ?? Buffer.from(''));
  }

  @Post('broker')
  @HttpCode(200)
  @RateLimit({ name: 'webhook-broker', limit: 600, windowSeconds: 60 })
  async broker(@Req() req: AppRequest) {
    return this.webhooks.receiveBroker(this.headers(req), req.rawBody ?? Buffer.from(''));
  }
}
