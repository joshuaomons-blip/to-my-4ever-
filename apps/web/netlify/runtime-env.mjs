// Runtime configuration for the Netlify sandbox profile. Values set in the Netlify UI take
// precedence; these defaults cover hosts where function env vars are not configured.
import secrets from './runtime-secrets.mjs';

const defaults = {
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  REDIS_URL: 'memory',
  SANDBOX_AUTO_VERIFY_EMAIL: 'true',
  AUTO_MIGRATE: 'true',
  PG_STATEMENT_TIMEOUT_MS: '0',
  PG_POOL_MAX: '3',
  WEB_ORIGIN: 'https://aureon-capital-sandbox.netlify.app',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@aureon.sandbox',
};

for (const [k, v] of Object.entries({ ...defaults, ...secrets })) process.env[k] ??= v;
