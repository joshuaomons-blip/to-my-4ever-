# Free sandbox hosting on Netlify

The public sandbox runs entirely on Netlify's free tier:

| Piece | How it runs |
|---|---|
| Customer web app | Next.js on Netlify (`netlify.toml`, base `apps/web`) |
| API | Netlify Function `apps/web/netlify/functions/api.mjs` at `/api/*`; boots the NestJS app in-process (`apps/api/src/serverless.ts`) |
| Database | Netlify Database (Postgres), connection via `@netlify/database`; migrations + seed run automatically on cold start (`AUTO_MIGRATE=true`) |
| Background jobs | Drained after each request (`context.waitUntil`) and every minute by the scheduled function `maintenance.mjs` |

## Differences from the production design (sandbox only — refused in live mode by config)

- `REDIS_URL=memory`: rate limits and TOTP replay protection are per function instance, not global.
- `SANDBOX_AUTO_VERIFY_EMAIL=true`: there is no email provider, so new accounts are marked verified;
  password-reset emails are captured in the database, not delivered.
- No dedicated worker: job latency is "next request or within a minute".
- `PG_STATEMENT_TIMEOUT_MS=0`: statement timeout startup parameter omitted for the pooled connection.

## Environment variables

Non-secret sandbox defaults live in `apps/web/netlify/runtime-env.mjs`; anything set in the Netlify
UI (scope: Functions) overrides them. Secrets go in `apps/web/netlify/runtime-secrets.mjs`, which is
an empty placeholder in git: the deploy step writes the real values into its export only. Settings:


`NODE_ENV=production`, `COOKIE_SECURE=true`, `REDIS_URL=memory`, `SANDBOX_AUTO_VERIFY_EMAIL=true`,
`AUTO_MIGRATE=true`, `PG_STATEMENT_TIMEOUT_MS=0`, `PG_POOL_MAX=3`, `WEB_ORIGIN`, `ADMIN_ORIGIN`,
`APP_ENCRYPTION_KEY` (secret), `SANDBOX_PAYMENT_WEBHOOK_SECRET` (secret), optionally
`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (secret; the admin enrols MFA at first sign-in).

Free-tier usage is metered in credits; if the monthly allowance runs out, Netlify pauses the site
rather than charging. Moving to production means following `deployment.md` instead.
