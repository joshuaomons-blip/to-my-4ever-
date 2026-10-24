# Aureon Capital — Architecture

> **Aureon Capital** is a placeholder brand. Change `BRAND_NAME` in `packages/ui/src/components/Brand.tsx`,
> app metadata, and email copy when the name is decided.

## 1. What this system is (and is not)

The platform owns the **brand, customer experience, onboarding workflow, records, and back office**.
It does **not** hold securities, execute trades, or clear/settle. Those are performed by a **licensed
brokerage partner** (broker-dealer / investment firm / custodian) through a provider-neutral adapter.
Money movement goes through **regulated payment providers**.

| Concern | Owner | Source of truth |
|---|---|---|
| Identity, sessions, MFA, audit | Platform | Platform DB |
| Eligibility, onboarding decisions | Platform (+ partner KYC where contracted) | Platform DB |
| Brokerage account, buying power, positions, executions, statements | **Partner** | **Partner API** (mirrored) |
| Platform-recorded cash movements, holds, fees | Platform | Double-entry ledger |
| Payments in/out | **Payment provider** | Provider (reconciled) |

Real-money operation is **gated in code**: the API refuses to start with `OPERATING_MODE=live` unless every
provider is non-sandbox, an explicit acknowledgement phrase is configured, and every launch gate has two
distinct staff approvals with evidence references (`apps/api/src/config/config.ts`,
`apps/api/src/compliance/controls.service.ts`).

## 2. Topology — a modular monolith

```
                ┌───────────────┐        ┌────────────────┐
 Customers ───▶ │ apps/web      │        │ apps/admin     │ ◀── Staff (VPN/SSO in prod)
                │ Next.js       │        │ Next.js        │
                └──────┬────────┘        └───────┬────────┘
                 /api/* proxy (same-origin cookies, CSRF header)
                       ▼                         ▼
                ┌─────────────────────────────────────────┐
                │ apps/api  (NestJS, one deployable)      │
                │  auth · onboarding · compliance ·       │
                │  orders · ledger · funding · portfolio ·│
                │  reconciliation · admin · webhooks      │
                └───┬───────────────┬──────────────┬──────┘
                    │               │              │
              PostgreSQL 16      Redis 7     apps/api worker (same image)
           (data, ledger, audit, (rate limits,  durable job queue in Postgres,
            durable job queue)   quote cache)   scheduler, partner sync)
                    │
     ┌──────────────┼──────────────────┬───────────────────┐
     ▼              ▼                  ▼                   ▼
 Brokerage      Payment provider    KYC / screening     Market data
 partner API    (signed webhooks)   providers           provider
 (adapter)      (adapter)           (adapters)          (adapter)
```

**Why a modular monolith:** one deployable, one database transaction boundary for ledger + state
changes, simple local development, fewer failure modes. Modules communicate through injected services,
not HTTP. The worker runs the same code with a different entrypoint and scales horizontally.
Split a module out only when it has a different scaling or isolation need (likely candidates: market
data streaming, partner event ingestion).

## 3. Repository layout

```
apps/api        NestJS API + worker. migrations/ (SQL), src/<module>/, test/ (integration)
apps/web        Customer Next.js app
apps/admin      Back-office Next.js app (separate origin, strict cookies)
apps/e2e        Playwright end-to-end tests
packages/ui     Design system: tokens, light/dark themes, components, charts
infra/docker    Container images
docs/           Architecture, API, operations, security, compliance, roadmap
```

## 4. Key design decisions

| Decision | Choice | Why / alternatives |
|---|---|---|
| Data access | Raw SQL via `pg` with explicit transactions and row locks | Financial code benefits from explicit locking and DB-enforced invariants. Prisma/Kysely possible; Kysely is the natural upgrade for typed queries. |
| Migrations | Forward-only SQL files, checksummed (`src/database/migrate.ts`) | Constraints, triggers and partial indexes are first-class. Edited migrations are refused. |
| Durable queue | Postgres table + `FOR UPDATE SKIP LOCKED` (`src/jobs`) | Jobs are enqueued **in the same transaction** as the state change (transactional outbox), so nothing is lost or orphaned. Redis/BullMQ was rejected for money workflows because enqueue cannot join the DB transaction. Revisit at >~500 jobs/s. |
| Redis | Rate limiting + 2s quote cache only | Nothing financial depends on Redis. Sensitive routes fail closed if it is down. |
| Sessions | Opaque random tokens, SHA-256 hashed at rest, HttpOnly cookies, idle + absolute expiry, double-submit CSRF bound to the session | Revocable server-side (JWTs are not). |
| MFA | TOTP (RFC 6238) mandatory for brokerage customers and all staff; step-up for sensitive actions; replay protection | WebAuthn/passkeys planned (roadmap). |
| Money | Integer minor units (`bigint`), `numeric` for quantities/prices, `decimal.js` in code | No floating point anywhere money is computed. |
| Frontend → API | Next.js rewrites `/api/*` to the API | First-party cookies, no CORS credentials surface for browsers. |

## 5. The ledger (platform-recorded cash)

Double-entry, integer minor units. Positive posting = debit, negative = credit. Enforced **in PostgreSQL**
(`migrations/0004_ledger.sql`):

- each journal entry balances to zero per currency (deferred constraint trigger);
- customer accounts can never go negative (`insufficient_funds` raised by the posting trigger, which
  also maintains running balances under a row lock — this is what serialises concurrent orders and
  withdrawals);
- journal entries and postings are append-only (UPDATE/DELETE/TRUNCATE rejected); corrections are
  exact reversing entries;
- every entry has a unique idempotency key, so retries and duplicate provider events post once.

Customer buckets (credit-normal liabilities): `available`, `pending` (deposits not yet settled), `held`
(reserved for open buy orders), `unsettled` (sale proceeds until T+1), `withdrawal_hold`, plus
`deficit` (debit-normal; a partner-reported fill larger than the reserve is recorded truthfully and
raises a high-severity alert rather than being refused). Platform accounts: `payment_clearing`,
`broker_settlement`, `platform_fee_revenue`.

| Event | Postings |
|---|---|
| Deposit initiated | Dr payment_clearing / Cr customer_pending |
| Deposit settled (after partner credit journal) | Dr customer_pending / Cr customer_available; Dr broker_settlement / Cr payment_clearing |
| Buy order placed | Dr customer_available / Cr customer_held (reserve = worst-case price + commission) |
| Buy fill (partner execution) | Dr customer_held (this order's reserve) [+ available, + deficit] / Cr broker_settlement (gross), Cr fee_revenue |
| Order terminal | Release unused reserve held → available |
| Sell fill | Dr broker_settlement / Cr customer_unsettled (net), Cr fee_revenue |
| Settlement date | unsettled → available |
| Withdrawal requested | available → withdrawal_hold |
| Withdrawal debited at partner | Dr withdrawal_hold / Cr broker_settlement, Cr fee_revenue |
| Payout failed | reverse the debit entry, then withdrawal_hold → available |
| Partner dividend / fee | Dr/Cr broker_settlement ↔ customer_available |

**Buying power** shown to customers is the partner's figure; the platform additionally requires ledger
`available` ≥ reserve so concurrent requests cannot double-spend before the partner reacts.

## 6. Order lifecycle

`pending_submit → (submitted|accepted) → partially_filled → filled`, with `pending_cancel`, `canceled`,
`rejected`, `expired`, `failed`. Rules (`src/orders/order-state.ts`, `orders.service.ts`):

1. **Idempotent placement**: `Idempotency-Key` header (API replay cache) **and** `UNIQUE(user_id, idempotency_key)`.
2. **Pre-trade checks**: kill switch, jurisdiction, onboarding, restrictions (incl. close-only),
   instrument tradability & jurisdiction restrictions (e.g. PRIIPs), fractional rules, price band
   (fat-finger), **stale-data block for market orders**, cash reserve, sellable quantity.
3. Reserve posted and a resolver job enqueued **in the same transaction** as the order row.
4. Submission uses a stable `client_order_id`. If the partner call times out, the order stays
   `pending_submit` and the resolver queries the partner **by client order id** before ever resubmitting.
5. Executions are recorded **only** from partner data, deduplicated by partner execution id; status
   moves forward only (out-of-order events are ignored); if the partner says `filled` but not all fills
   are visible yet, the order stays `partially_filled` and re-syncs.
6. Partner events are hints; the platform always re-fetches the authoritative order.

## 7. Integrations (adapters)

| Boundary | Interface | Implementations |
|---|---|---|
| Brokerage | `src/brokerage/broker-adapter.ts` | `SandboxBrokerAdapter` (simulation, schema `sandbox_partner`), `AlpacaBrokerAdapter` |
| Market data | `src/market-data/market-data.adapter.ts` | `SandboxMarketDataAdapter` (deterministic, flagged `simulated`) |
| Payments | `src/payments/payment-adapter.ts` | `SandboxPaymentAdapter` (signed webhooks through the real verification path) |
| KYC / screening | `src/onboarding/kyc.adapter.ts` | Sandbox adapters with documented trigger names |
| Email | `src/notifications/mailer.service.ts` | Captures to DB in sandbox; refuses live mode until an ESP adapter exists |

See `docs/integrations/brokerage-providers.md` for provider research and evidence status.

## 8. Reconciliation

Daily (and on demand) `ReconciliationService` compares, per partner account: partner cash vs ledger
customer total + uncollected platform fees; partner positions vs net executed quantity; orders stuck
without partner confirmation; and the global trial balance. Breaks are stored and resolved by staff
with a mandatory note — nothing is auto-corrected.

## 9. Unresolved decisions (need business/legal input)

1. **Operating model per jurisdiction**: introducing broker (fully disclosed) vs omnibus; appointed
   representative / tied agent vs own licence. Drives KYC ownership, client-money handling, statements.
2. **Brokerage partner(s)**: one global partner vs regional partners (e.g. US/global, EU, Nigeria).
3. **Funding currencies and FX**: accounts are USD-only today; GBP/EUR/NGN funding needs an FX provider
   and disclosure of spreads (schema and fee schedule already support it).
4. **KYC vendor** (coverage for Nigeria NIN/BVN, UK, EU) and whether the partner's KYC suffices.
5. **Market data licence** (real-time vs delayed; display and redistribution fees per exchange).
6. **Cloud region(s) and data residency**, especially for EU (GDPR transfers) and Nigeria (NDPA).
7. **Staff identity**: SSO provider and hardware-key MFA for the admin console.
