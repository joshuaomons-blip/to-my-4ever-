# Threat model (STRIDE)

Scope: customer web app, admin console, API/worker, PostgreSQL, Redis, partner/payment/KYC integrations.
Assets, in priority order: customer funds and positions (held at partner), ability to move money,
customer PII (identity documents, tax IDs), integrity of financial records, staff privileges,
availability of trading.

## Trust boundaries

1. Internet → web/admin (browser) → API via same-origin proxy.
2. Providers → webhook endpoints (signature-authenticated, not session-authenticated).
3. API/worker → partner, payment, KYC APIs (outbound, credentialed).
4. Staff → admin console (should be private network + SSO in production).
5. Application → database (least-privilege DB role recommended: no superuser, no DDL at runtime).

## Threats and mitigations

| # | Threat (STRIDE) | Mitigations in code | Residual / to do |
|---|---|---|---|
| S1 | Credential stuffing / brute force (S) | Argon2id; per-IP and per-account rate limits failing closed; lockout after 5 failures; generic error messages; mandatory MFA for brokerage customers | Breached-password check (k-anonymity API); device fingerprinting; WebAuthn |
| S2 | Session theft (S) | Opaque tokens hashed at rest; HttpOnly, SameSite, `__Host-` + Secure in prod; idle/absolute expiry; revoke on password change; session list & revoke | Bind sessions to device risk signals |
| S3 | CSRF (S/T) | Double-submit CSRF token bound to session hash on all mutating requests; SameSite=Lax (customer)/Strict (staff); CORS allow-list | — |
| S4 | MFA bypass / replay (S) | TOTP replay protection per time-step (Redis); recovery codes hashed and single-use; step-up for withdrawals, payment method linking, MFA disable, all sensitive admin actions | SMS deliberately not offered; add WebAuthn |
| S5 | Forged provider webhooks (S/T) | HMAC-SHA256 over timestamp+body, constant-time compare, 5-min tolerance, raw body preserved, unique event id storage; events treated as hints and state re-fetched | Per-provider IP allow-listing at WAF |
| T1 | Tampering with balances/ledger (T) | DB-enforced balanced entries, non-negative balances, append-only postings/journals/executions/audit; balances only via trigger; reversals instead of edits | Run app with a DB role lacking `ALTER TABLE`/trigger privileges; ship WAL to separate account |
| T2 | Duplicate orders / deposits / withdrawals (T) | Idempotency keys (API + DB unique), client order ids, ambiguous-timeout resolver, provider-reference uniqueness, job dedupe keys | — |
| T3 | Race conditions double-spending cash (T) | Ledger balance row lock in posting trigger; holds posted in same transaction as order/withdrawal; tested with concurrent requests | — |
| T4 | Price manipulation / stale data (T) | Quotes carry source timestamps; market orders blocked when stale; price band; partner is authoritative for fills | Licensed real-time feed; circuit breakers on extreme moves |
| R1 | Repudiation of staff actions (R) | Hash-chained append-only audit log with request id, IP, UA; reasons required for sensitive actions; four-eyes on restriction lifts, fee activation, launch gates | Stream audit to SIEM/WORM |
| I1 | PII disclosure (I) | Tax IDs and MFA secrets AES-256-GCM encrypted with context-bound AAD; only last 4 shown; PII masked for roles without `customers.pii`; customer record views audited; audit metadata redaction | Document storage (KYC images) should stay at the KYC vendor; data-retention jobs |
| I2 | Account enumeration (I) | Register/forgot/resend respond identically; timing equalisation on login | — |
| I3 | Secrets leakage (I) | Secrets only via env/secret manager; `.env*` ignored; gitleaks in CI; no secrets in frontend bundles (all provider calls server-side) | Pre-commit hook |
| I4 | IDOR (I/E) | All customer queries scoped by `user_id` from session; tested (other customer's order → 404) | Add authz tests per new endpoint |
| D1 | DoS / resource exhaustion (D) | Global + route rate limits, statement timeout, body validation with whitelist, pagination caps | WAF rate rules, autoscaling |
| D2 | Partner/provider outage (D) | Kill switches, retries with backoff, dead-letter queue, polling fallback, snapshot buying power | Status page |
| E1 | Privilege escalation in admin (E) | Separate staff identity store and cookie; roles loaded per request; least-privilege permission map; step-up; staff MFA mandatory; sanctioned jurisdictions cannot be enabled | SSO + hardware keys; just-in-time elevation; admin on private network |
| E2 | Supply-chain compromise (E) | Pinned versions + lockfile, Dependabot, `pnpm audit`, CodeQL, distroless non-root images | SBOM + image signing (cosign), provenance |
| E3 | XSS (E/I) | React escaping; no `dangerouslySetInnerHTML` except the static theme bootstrap; CSP `default-src 'self'`, `frame-ancestors 'none'` | Nonce-based CSP to drop `'unsafe-inline'` |

## Security testing

- Automated: unit/integration tests for authz, CSRF, MFA replay, webhook signatures, idempotency,
  concurrency; CodeQL; dependency audit; secret scanning.
- Before launch (launch gate `security_review`): independent penetration test of web, admin and API;
  secure code review of ledger, orders, funding and auth; cloud configuration review.
- Ongoing: quarterly access reviews of staff roles, annual pen test, bug bounty after launch.
