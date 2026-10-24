import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/config';

// Safety net: never let a bigint crash JSON serialisation (amounts are normally pre-formatted strings).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Aureon Capital Platform API')
    .setDescription(
      'Customer and back-office API. Brokerage services are provided through licensed partners; in sandbox mode all ' +
        'providers are simulated. Authentication uses HttpOnly session cookies plus an X-CSRF-Token header for mutating requests. ' +
        'Money-moving POSTs require an Idempotency-Key header.',
    )
    .setVersion('0.1.0')
    .addCookieAuth('aur_sid')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: opts.logger === false ? false : undefined });
  const cfg = app.get<AppConfig>(APP_CONFIG);
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  express.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({ origin: [cfg.webOrigin, cfg.adminOrigin], credentials: true, allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key', 'x-request-id'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: false }));
  app.enableShutdownHooks();
  if (cfg.nodeEnv !== 'production') {
    const doc = buildOpenApi(app);
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/openapi.json' });
  }
  return app;
}
