/**
 * Centralised, validated configuration. The process refuses to start with an unsafe or
 * inconsistent configuration (e.g. live operating mode with sandbox providers).
 */
export type OperatingMode = 'sandbox' | 'live';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  redisUrl: string;
  encryptionKey: Buffer;
  cookieSecure: boolean;
  webOrigin: string;
  adminOrigin: string;
  operatingMode: OperatingMode;
  liveAcknowledgement: string | undefined;
  brokerProvider: 'sandbox' | 'alpaca';
  alpaca: { baseUrl: string; apiKey?: string; apiSecret?: string };
  marketDataProvider: 'sandbox';
  paymentProvider: 'sandbox';
  kycProvider: 'sandbox';
  sandboxPaymentWebhookSecret: string;
  sandboxBrokerWebhookSecret: string;
  quoteStaleAfterSeconds: number;
  withdrawalReviewThresholdMinor: bigint;
  session: { idleMinutes: number; absoluteHours: number; staffIdleMinutes: number; staffAbsoluteHours: number };
  stepUpWindowSeconds: number;
  exposeDevMailbox: boolean;
  rateLimitMultiplier: number;
  sandboxAutoVerifyEmail: boolean;
  pgStatementTimeoutMs: number;
  logLevel: string;
}

export const LIVE_ACK_PHRASE =
  'I confirm all launch gates are approved and real-money operations are authorised';

function req(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim() === '') throw new Error(`Missing required environment variable ${key}`);
  return v;
}

function int(env: NodeJS.ProcessEnv, key: string, dflt: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${key} must be an integer`);
  return n;
}

function oneOf<T extends string>(env: NodeJS.ProcessEnv, key: string, allowed: readonly T[], dflt: T): T {
  const v = (env[key] ?? dflt) as T;
  if (!allowed.includes(v)) throw new Error(`${key} must be one of ${allowed.join(', ')}`);
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = oneOf(env, 'NODE_ENV', ['development', 'test', 'production'] as const, 'development');
  const keyB64 = req(env, 'APP_ENCRYPTION_KEY');
  const encryptionKey = Buffer.from(keyB64, 'base64');
  if (encryptionKey.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes, base64 encoded');

  const operatingMode = oneOf(env, 'OPERATING_MODE', ['sandbox', 'live'] as const, 'sandbox');
  const brokerProvider = oneOf(env, 'BROKER_PROVIDER', ['sandbox', 'alpaca'] as const, 'sandbox');

  const cfg: AppConfig = {
    nodeEnv,
    port: int(env, 'PORT', 4000),
    databaseUrl: req(env, 'DATABASE_URL'),
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    encryptionKey,
    cookieSecure: (env.COOKIE_SECURE ?? (nodeEnv === 'production' ? 'true' : 'false')) === 'true',
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
    adminOrigin: env.ADMIN_ORIGIN ?? 'http://localhost:3001',
    operatingMode,
    liveAcknowledgement: env.LIVE_OPERATIONS_ACKNOWLEDGEMENT,
    brokerProvider,
    alpaca: {
      baseUrl: env.ALPACA_BROKER_BASE_URL ?? 'https://broker-api.sandbox.alpaca.markets',
      apiKey: env.ALPACA_BROKER_API_KEY,
      apiSecret: env.ALPACA_BROKER_API_SECRET,
    },
    marketDataProvider: oneOf(env, 'MARKET_DATA_PROVIDER', ['sandbox'] as const, 'sandbox'),
    paymentProvider: oneOf(env, 'PAYMENT_PROVIDER', ['sandbox'] as const, 'sandbox'),
    kycProvider: oneOf(env, 'KYC_PROVIDER', ['sandbox'] as const, 'sandbox'),
    sandboxPaymentWebhookSecret: env.SANDBOX_PAYMENT_WEBHOOK_SECRET ?? '',
    sandboxBrokerWebhookSecret: env.SANDBOX_BROKER_WEBHOOK_SECRET ?? '',
    quoteStaleAfterSeconds: int(env, 'QUOTE_STALE_AFTER_SECONDS', 60),
    withdrawalReviewThresholdMinor: BigInt(int(env, 'WITHDRAWAL_REVIEW_THRESHOLD_MINOR', 100_000)),
    session: {
      idleMinutes: int(env, 'SESSION_IDLE_MINUTES', 30),
      absoluteHours: int(env, 'SESSION_ABSOLUTE_HOURS', 12),
      staffIdleMinutes: int(env, 'STAFF_SESSION_IDLE_MINUTES', 15),
      staffAbsoluteHours: int(env, 'STAFF_SESSION_ABSOLUTE_HOURS', 8),
    },
    stepUpWindowSeconds: int(env, 'STEP_UP_WINDOW_SECONDS', 300),
    exposeDevMailbox: env.EXPOSE_DEV_MAILBOX === 'true',
    rateLimitMultiplier: int(env, 'RATE_LIMIT_MULTIPLIER', 1),
    sandboxAutoVerifyEmail: env.SANDBOX_AUTO_VERIFY_EMAIL === 'true',
    pgStatementTimeoutMs: int(env, 'PG_STATEMENT_TIMEOUT_MS', 15_000),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
  assertSafeConfig(cfg);
  return cfg;
}

/** Static safety checks. Dynamic launch-gate checks happen in OperatingModeService at boot. */
export function assertSafeConfig(cfg: AppConfig): void {
  if (cfg.nodeEnv === 'production' && !cfg.cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  if (cfg.rateLimitMultiplier !== 1 && (cfg.nodeEnv === 'production' || cfg.operatingMode === 'live')) {
    throw new Error('RATE_LIMIT_MULTIPLIER may only be changed outside production');
  }
  // Sandbox-hosting conveniences (no email provider, no Redis) are never allowed for real-money operation.
  if (cfg.operatingMode === 'live' && (cfg.sandboxAutoVerifyEmail || cfg.redisUrl === 'memory')) {
    throw new Error('SANDBOX_AUTO_VERIFY_EMAIL and REDIS_URL=memory are only permitted in sandbox mode');
  }
  if (cfg.exposeDevMailbox && (cfg.nodeEnv === 'production' || cfg.operatingMode === 'live')) {
    throw new Error('EXPOSE_DEV_MAILBOX is only permitted in non-production sandbox environments');
  }
  if (cfg.brokerProvider === 'alpaca' && (!cfg.alpaca.apiKey || !cfg.alpaca.apiSecret)) {
    throw new Error('ALPACA_BROKER_API_KEY and ALPACA_BROKER_API_SECRET are required when BROKER_PROVIDER=alpaca');
  }
  if (cfg.operatingMode === 'live') {
    const sandboxed = [
      ['BROKER_PROVIDER', cfg.brokerProvider],
      ['MARKET_DATA_PROVIDER', cfg.marketDataProvider],
      ['PAYMENT_PROVIDER', cfg.paymentProvider],
      ['KYC_PROVIDER', cfg.kycProvider],
    ].filter(([, v]) => v === 'sandbox');
    if (sandboxed.length) {
      throw new Error(
        `OPERATING_MODE=live cannot use sandbox providers: ${sandboxed.map(([k]) => k).join(', ')}`,
      );
    }
    if (cfg.brokerProvider === 'alpaca' && cfg.alpaca.baseUrl.includes('sandbox')) {
      throw new Error('OPERATING_MODE=live cannot point at a sandbox broker URL');
    }
    if (cfg.liveAcknowledgement !== LIVE_ACK_PHRASE) {
      throw new Error('OPERATING_MODE=live requires LIVE_OPERATIONS_ACKNOWLEDGEMENT to be set exactly');
    }
  } else {
    if (cfg.paymentProvider === 'sandbox' && cfg.sandboxPaymentWebhookSecret.length < 16) {
      throw new Error('SANDBOX_PAYMENT_WEBHOOK_SECRET must be at least 16 characters');
    }
  }
}

export const APP_CONFIG = Symbol('APP_CONFIG');
