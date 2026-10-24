# Phased roadmap, costs and launch requirements

Cost figures are **indicative planning ranges** (USD, 2026) to be replaced by real quotes. Legal and
licensing costs vary enormously by structure and country.

## Phase 0 — Done in this repository (sandbox platform)
Modular monolith API, double-entry ledger with DB-enforced invariants, onboarding/eligibility/KYC
boundary, provider-neutral brokerage adapter with sandbox partner and Alpaca adapter, order lifecycle
with idempotency and outage handling, funding with signed webhooks, reconciliation, admin console with
RBAC/step-up/four-eyes, customer web app, design system, unit/integration/e2e tests, CI, Docker,
documentation, launch-gate enforcement.

## Phase 1 — Structure and partner selection (≈ 2–4 months)
- Decide operating model and launch countries (recommendation: start with **one** jurisdiction).
- Engage counsel per launch country; incorporate/choose the contracting entity.
- Shortlist and negotiate with brokerage partner(s) (`docs/integrations/brokerage-providers.md`).
- Choose KYC/screening vendor, payment provider(s), market data licence.
- **Costs**: legal & regulatory advice $40k–$200k+ per country; entity set-up $2k–$20k.
- **Dependencies**: partner due diligence and acceptance; regulator pre-application meetings.

## Phase 2 — Partner sandbox integration (≈ 1–3 months, overlaps Phase 1)
- Run the integration suite against the partner sandbox; finalise field mappings; implement the
  partner event stream consumer (e.g. Alpaca SSE) with durable cursors.
- Implement real KYC, screening, payment and email adapters; webhook signature schemes per vendor.
- FX conversion if non-USD funding is in scope.
- **Costs**: engineering (2–4 engineers); vendor sandbox usually free; KYC $1–$5 per check in production.

## Phase 3 — Authorisation and compliance build-out (≈ 3–12 months, jurisdiction-dependent)
- Licence / AR / tied-agent applications; AML programme; policies; staff training; MLRO/DPO.
- Replace all draft legal documents; marketing approval workflow.
- **Costs**: application fees and capital requirements vary (own FCA/MiFID/BD authorisation is a
  six-figure undertaking including capital); AR/tied-agent routes are cheaper but depend on a principal.
  Compliance staff/outsourced MLRO $60k–$200k/yr.

## Phase 4 — Production readiness (≈ 1–2 months)
- Production cloud accounts, private admin access with SSO + hardware keys, WAF, SIEM, backups to a
  separate account, WORM records export.
- Penetration test and remediation; DR exercise; parallel-run reconciliation with the partner.
- Hardening items: nonce-based CSP, WebAuthn/passkeys, multi-key encryption rotation, DB role
  separation (migration role vs runtime role), SBOM/image signing.
- **Costs**: pen test $15k–$50k; cloud $1k–$4k/month initially (managed Postgres Multi-AZ, Fargate,
  Redis, WAF, logging); monitoring $0–$1.5k/month; market data $0 (delayed) to several $k/month
  (real-time, per-exchange fees).

## Phase 5 — Controlled launch
- Approve launch gates (two approvers each, evidence recorded); set the country to `live`.
- Friends-and-family cohort with low limits, daily reconciliation review, then gradual limit increases.
- **Ongoing**: partner fees (per account/trade/minimums), payment fees, KYC per check, support staff,
  annual pen test, audits.

## Launch requirements (must all be true)
1. Authorisation or approved arrangement in place for every enabled country.
2. Signed partner and payment agreements; responsibilities matrix agreed.
3. AML/sanctions programme approved and operating with real screening vendors.
4. Counsel-approved customer documents published and versioned.
5. Independent security review passed; incident response contacts filled in.
6. Backup restore and DR tested to targets.
7. Reconciliation clean through a parallel run.
8. Privacy DPIA and data-transfer mechanisms in place.
9. All launch gates approved in the admin console; `OPERATING_MODE=live` with non-sandbox providers.

## Known gaps / next engineering items
- Partner event-stream consumer (SSE) — polling and resolver jobs cover correctness meanwhile.
- FX conversion, multi-currency accounts beyond USD.
- Document download proxy from the partner documents API.
- Corporate-action processing beyond cash dividends (splits/mergers are reflected via partner positions).
- WebAuthn, admin SSO, nonce-based CSP, encryption key versioning.
- Notification channels beyond in-app (email/push) and customer email templates.
- Load testing and capacity planning.
