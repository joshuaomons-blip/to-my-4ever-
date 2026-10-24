# Deployment, monitoring, backups and recovery

## Reference production topology (cost-conscious)

One cloud provider, one primary region close to your regulated entity, managed services everywhere.
Example on AWS (equivalents exist on GCP/Azure):

| Component | Service | Notes |
|---|---|---|
| API, worker, web, admin | ECS Fargate (or Cloud Run / App Service) | Images from `infra/docker`. API ≥2 tasks across AZs; worker ≥2 (jobs use SKIP LOCKED, safe to scale). |
| Database | RDS PostgreSQL 16, Multi-AZ | Encryption at rest (KMS), PITR enabled, deletion protection, `rds.force_ssl=1`. |
| Redis | ElastiCache Redis 7 (TLS, auth) | Non-critical: losing it degrades rate limiting (sensitive routes fail closed). |
| Edge | CloudFront/ALB + WAF | TLS 1.2+, HSTS, managed rule sets, geo rules aligned with jurisdiction config, bot control on auth routes. |
| Admin console | Separate hostname, **private** (VPN / Zero-Trust proxy + SSO) | Never internet-exposed in production. |
| Secrets | Secrets Manager / Parameter Store | Injected as env vars at task start; never in images or git. |
| Encryption key | KMS-protected data key → `APP_ENCRYPTION_KEY` | Rotation runbook below. |
| Logs | CloudWatch Logs → retention per records policy; optional Datadog/Grafana Loki | API/worker emit one JSON object per line in production. |
| Metrics/alerts | CloudWatch / Prometheus + Grafana / Datadog | See alert list below. |
| Email | SES / Postmark via a new `MailerService` transport | Live mode refuses to start sending without one. |

Environments: `dev` (sandbox), `staging` (sandbox, production-like, partner sandbox keys),
`production` (sandbox until all launch gates are approved, then live). Separate cloud accounts per
environment; production data never copied to lower environments.

## Release process

1. PR → CI (typecheck, unit + integration, builds, e2e, OpenAPI drift, audit, secret scan, CodeQL).
2. Merge to `main` → build images tagged with the commit SHA, push to registry, sign (cosign) and scan.
3. Deploy to staging: run the migrate task (`dist/database/migrate.js`) **before** rolling the services;
   migrations must be backward compatible with the previous release (expand → migrate → contract).
4. Smoke test (`/readyz`, e2e subset) → manual approval → production with rolling deploy.
5. Rollback = redeploy previous image. Migrations are forward-only; to undo, ship a new migration.

## Required production configuration

See `apps/api/.env.example`. Startup **refuses** unsafe configurations: missing/short keys, insecure
cookies in production, dev tooling flags in production, rate-limit multipliers in production, live mode
with any sandbox provider, a sandbox partner URL, a missing acknowledgement phrase, or any unapproved
launch gate.

## Monitoring & alerting

| Signal | Alert |
|---|---|
| `/readyz` failing | page |
| API 5xx rate > 1% (5 min) / p95 latency > 1s | page |
| Dead-letter jobs > 0 | ticket; page if queue is `deposits.settle`, `withdrawals.*`, `orders.*` |
| Jobs pending older than 5 min | page |
| Orders in `pending_submit` > 15 min | page (partner connectivity) |
| Reconciliation breaks > 0 or trial balance not zero | page finance/ops on-call |
| Webhook signature failures spike | security ticket |
| `admin.access_denied`, repeated `auth.login` failures, `auth.mfa_verify` failures | security dashboard / SIEM |
| Partner / payment provider error rate | page; consider kill switch |
| DB CPU > 80%, storage < 20%, replica lag | ticket |
| Certificate expiry < 21 days | ticket |

Ship `audit_log` to the SIEM (append-only copy) and verify the hash chain daily
(`GET /v1/admin/audit/verify`).

## Backups and recovery

- **RPO ≤ 5 min / RTO ≤ 1 h** targets (confirm with the business and partner contract).
- RDS automated backups + PITR (35 days) + daily snapshot copied to a second region and a separate
  backup account (immutable, Vault Lock / Object Lock).
- Records retention beyond backups: periodic export of ledger, orders, executions, audit log and
  onboarding records to WORM storage (e.g. S3 Object Lock, compliance mode) — required for SEC 17a-4
  style obligations if applicable to your model.
- **Restore test monthly**: restore the latest snapshot into an isolated account, run migrations
  check, `SELECT` trial balance, run `GET /v1/admin/audit/verify`, run reconciliation against partner
  sandbox data, record timings. This is launch gate `dr_tested`.

## Runbooks

**Partner outage** — Symptoms: orders stuck `pending_submit`, sync jobs failing. Action: pause
`trading_enabled` (admin → Controls) with a reason; customer banner; when restored, resume — the resolver
jobs confirm every pending order by client order id (no duplicates). Run reconciliation afterwards.

**Payment provider outage** — Pause `deposits_enabled` / `withdrawals_enabled`. Pending items stay
on hold; nothing is lost. Replay missed webhooks from the provider dashboard (duplicates are ignored).

**Reconciliation break** — Do not edit balances. Investigate against partner statements; if the
platform ledger is wrong, post a correcting entry through a reviewed migration/script that uses
`LedgerService.reverse` or a new journal with a clear reference; resolve the break with the root cause.

**Key rotation (`APP_ENCRYPTION_KEY`)** — Add a versioned key, deploy code that decrypts with old and
encrypts with new (envelope `v1.` prefix supports versioning), run a re-encryption job for
`users.mfa_secret_enc`, `staff_users.mfa_secret_enc`, `customer_profiles.tax_id_enc`, then retire the
old key. (Multi-key support is a roadmap item.)

**Suspected account takeover** — Admin: apply `full_freeze`; revoke sessions (password reset forces
this); review audit log by actor; contact customer through a verified channel.
