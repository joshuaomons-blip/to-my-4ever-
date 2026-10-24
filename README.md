# Aureon Capital — brokerage platform (sandbox)

A professional stock & ETF investing platform designed to operate **through licensed brokerage,
custody and payment partners**. *Aureon Capital is a placeholder name.*

> **Status: sandbox only.** All partners, payments, KYC and prices are simulated. The company is not
> authorised to provide investment services. Real-money operation is blocked in code until every launch
> gate is approved (see [docs/compliance/checklist.md](docs/compliance/checklist.md)).

## What's here

| Path | What |
|---|---|
| `apps/api` | NestJS API + background worker, PostgreSQL migrations, unit & integration tests |
| `apps/web` | Customer app: onboarding, dashboard, markets, order ticket, funding, statements, support |
| `apps/admin` | Back-office console: reviews, monitoring, withdrawals, reconciliation, fees, controls, audit |
| `apps/e2e` | Playwright end-to-end tests |
| `packages/ui` | Design system (tokens, light/dark themes, components, accessible charts) |
| `docs/` | [Architecture](docs/ARCHITECTURE.md) · [API](docs/api/README.md) · [Deployment & ops](docs/operations/deployment.md) · [Threat model](docs/security/threat-model.md) · [Incident response](docs/security/incident-response.md) · [Compliance checklist](docs/compliance/checklist.md) · [Brokerage providers](docs/integrations/brokerage-providers.md) · [Roadmap](docs/roadmap.md) |

## Quick start (local, sandbox)

Prerequisites: Node 22, pnpm 10, PostgreSQL 16, Redis 7 (or `docker compose`).

```bash
pnpm install
createdb aureon_dev           # role/password per apps/api/.env.example
cp apps/api/.env.example apps/api/.env   # fill APP_ENCRYPTION_KEY, webhook secrets, BOOTSTRAP_ADMIN_PASSWORD
set -a; . apps/api/.env; set +a
pnpm db:migrate && pnpm db:seed          # prints the bootstrap admin's TOTP secret once
pnpm --filter @aureon/api dev            # API on :4000 (worker in-process when RUN_WORKER_IN_PROCESS=true)
pnpm --filter @aureon/web dev            # customer app on :3000
pnpm --filter @aureon/admin dev          # admin console on :3001
```

Or the whole stack in containers: `cp .env.compose.example .env.compose` (fill values) then
`docker compose --env-file .env.compose up --build`.

API docs: <http://localhost:4000/docs> (non-production) and [docs/api/openapi.json](docs/api/openapi.json).

### Sandbox behaviours (for testers)

| Trigger | Result |
|---|---|
| Legal last name starting `Review` / `Reject` | KYC → manual review / rejected |
| Name `Sanction Testperson` | Screening potential match → manual review |
| Family name containing `ActionRequired` | Partner account needs action |
| Deposit or withdrawal amount ending in `.13` | Payment / payout fails |
| Order quantity ≥ 100 | Partial fill now, remainder on next partner tick |
| `POST /v1/dev/faults` `{key:"outage"}` | Partner outage (dev endpoints need `EXPOSE_DEV_MAILBOX=true`) |
| `POST /v1/dev/stale-quote` | Stale market data for a symbol |

## Tests

```bash
pnpm --filter @aureon/api test   # unit + integration (needs Postgres DB aureon_test and Redis)
pnpm --filter @aureon/e2e test   # browser e2e against a running sandbox stack
pnpm -r typecheck
```

Integration tests cover onboarding & eligibility, the order lifecycle (partial fills, cancels,
rejections, duplicate requests, stale data, partner outage, ambiguous timeouts, concurrency),
deposits/withdrawals (failed payments, duplicate and forged webhooks, payout failure), reconciliation
breaks, RBAC, step-up and four-eyes controls.
