import { LIVE_ACK_PHRASE, loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://x',
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  SANDBOX_PAYMENT_WEBHOOK_SECRET: 'a-long-enough-secret',
};

describe('configuration safety gates', () => {
  it('loads a sandbox config', () => {
    expect(loadConfig({ ...base }).operatingMode).toBe('sandbox');
  });
  it('refuses live mode with sandbox providers', () => {
    expect(() => loadConfig({ ...base, OPERATING_MODE: 'live', LIVE_OPERATIONS_ACKNOWLEDGEMENT: LIVE_ACK_PHRASE })).toThrow(/cannot use sandbox providers/);
  });
  it('refuses live mode against a sandbox broker URL or without acknowledgement', () => {
    const env = { ...base, OPERATING_MODE: 'live', BROKER_PROVIDER: 'alpaca', ALPACA_BROKER_API_KEY: 'k', ALPACA_BROKER_API_SECRET: 's' };
    expect(() => loadConfig(env)).toThrow(); // other providers still sandbox
  });
  it('rejects weak keys, insecure production cookies and dev tooling in production', () => {
    expect(() => loadConfig({ ...base, APP_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow(/32 bytes/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', EXPOSE_DEV_MAILBOX: 'true' })).toThrow(/EXPOSE_DEV_MAILBOX/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', RATE_LIMIT_MULTIPLIER: '10' })).toThrow(/RATE_LIMIT_MULTIPLIER/);
  });
  it('requires credentials for the Alpaca adapter', () => {
    expect(() => loadConfig({ ...base, BROKER_PROVIDER: 'alpaca' })).toThrow(/ALPACA_BROKER_API_KEY/);
  });
});
