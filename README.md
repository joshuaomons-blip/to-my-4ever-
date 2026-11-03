# Tesla Investment — Sandbox Brokerage Platform

A full-stack **sandbox** investment platform focused on TSLA, with a customer dashboard and a separate super-administrator console.

> **Sandbox only.** All balances, deposits, withdrawals, orders and holdings are simulated with virtual funds. No real money moves, no shares are bought, and no bank, card or government-ID data is collected. The platform is independent and **not affiliated with Tesla, Inc.** These disclosures are hard-coded and cannot be removed from the admin console.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts, Lucide |
| Backend | Next.js route handlers (`src/app/api`), service layer (`src/server`) |
| Database | PostgreSQL + Prisma ORM |
| Auth | Server-side sessions (HTTP-only cookies, SHA-256 hashed tokens), scrypt password hashing, TOTP 2FA, RBAC |
| Documents | `pdf-lib` statements, CSV exports |

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL and a random ADMIN_SETUP_TOKEN (32+ chars)
npm install
npx prisma migrate deploy       # create tables
npm run db:seed                 # optional: 12 clearly labeled demo customers + simulated history
npm run dev                     # http://localhost:3000
```

Create the first **super administrator**. There is no hard-coded admin password; use one of these:

1. Open **`/admin/setup`** and enter the `ADMIN_SETUP_TOKEN` from the server environment. The page permanently disables itself once a super admin exists.
2. Or use the CLI: `ADMIN_EMAIL=you@co.com ADMIN_PASSWORD='Long-Unique-Passphrase-1' npm run admin:create`

Then sign in at **`/admin/login`** and enable 2FA under **My security**.

The seed prints the demo customer password. Set `SEED_CUSTOMER_PASSWORD` to choose your own. Verification and password-reset emails are captured in the **sandbox mailbox** at `/dev/mailbox`. Disable it with `SANDBOX_MAILBOX=false` once SMTP is wired into `src/server/mailer.ts`.

## Customer experience (`/app`)

1. **Registration & login.** Sign-up, email verification, password recovery, profile, optional TOTP 2FA, session management.
2. **Identity verification.** Sandbox KYC form with *not started / pending / approved / rejected* states. It collects no ID numbers or images.
3. **Dashboard.** Total value, cash, invested amount, P/L, a live sandbox TSLA quote, and a portfolio performance chart (1D–ALL).
4. **Funding.** Virtual deposits (sandbox ACH, wire or card labels only), pending → completed settlement, payment history.
5. **Buy shares.** Dollar or share orders, fractional to 6 dp, a fee preview, a confirmation step and a receipt.
6. **Sell shares.** Sell any portion with confirmation; balances update immediately.
7. **Withdrawals.** Requests reserve funds and wait for admin review. Customers can cancel while pending. Rejected requests are refunded.
8. **Transaction history.** Filter by type, status, date and reference; per-transaction receipts.
9. **Statements.** PDF portfolio summary and transaction report for any period, watermarked *SANDBOX*.

Requirements are enforced server-side: deposits need a verified email; trading and withdrawals need approved KYC; maintenance mode pauses all money movement.

## Super admin console (`/admin`)

- **Overview.** Customers, active/suspended/flagged counts, pending KYC and withdrawals, simulated deposits/withdrawals/investments/volume, a 30-day activity chart, the latest audit events and transactions.
- **Customers.** Search and filter; profile, portfolio, holdings, KYC, transactions, notes and activity; suspend/reactivate (revokes sessions), flag suspicious activity, add notes, force sign-out.
- **KYC.** Queue by status, approve/reject (a reason is required for rejection), internal review notes.
- **Transactions.** Filters, totals, detail pages with audit trail, CSV export.
- **Withdrawals.** Pending queue (oldest first), approve/reject with notes, decision history and audit trail.
- **Website content.** Homepage hero, announcements, in-app notifications (to everyone or one customer), support info, FAQ, investment info, maintenance mode.
- **Settings.** Platform name, logo upload, accent colour and hero style, simulated fees and min/max limits, *require 2FA for admins* policy.
- **Administrators.** Create admins (one-time temporary password), roles (`SUPPORT`, `ADMIN`, `SUPER_ADMIN`), per-permission toggles, suspend, reset password.
- **Audit log.** Searchable record of logins, failures, security changes and every admin decision.

### Permissions

`customers:read`, `customers:manage`, `kyc:review`, `transactions:read`, `transactions:export`, `withdrawals:review`, `content:manage`, `settings:manage`, `admins:manage` (super admin only), `audit:read`. Every admin API route and page checks its permission on the server.

## Security

- Separate customer (`ti_session`) and admin (`ti_admin`) sessions. A token is valid only for its scope **and** a matching role, so customers can never reach admin routes.
- Session tokens are 256-bit random values, stored only as SHA-256 hashes. Admin sessions last 8 h with a 60-minute idle timeout.
- scrypt password hashing, 12+ character password policy, account lockout after 5 failures, timing-safe login.
- TOTP 2FA (RFC 6238) for customers and admins, with an optional mandatory policy for admins.
- PostgreSQL-backed rate limiting (login, registration, reset, MFA, trading, per-user API writes).
- CSRF protection via Origin checks and JSON-only mutations, plus SameSite=Lax cookies.
- Zod validation on every input; CSV formula-injection escaping; security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production).
- Race-safe ledger: balance and holding changes use conditional atomic updates inside transactions.
- No secrets in the frontend; broker credentials (future) are server-only environment variables.

## Brokerage adapter

Every deposit, withdrawal and order goes through `BrokerAdapter` (`src/server/broker/types.ts`):

- `SandboxBroker` (the default, `BROKER_MODE=sandbox`) uses a deterministic simulated TSLA price feed (`src/lib/market-sim.ts`) and simulated fills and transfers.
- `UnimplementedLicensedBroker` (`alpaca`, `drivewealth`) refuses every call. Going live requires a licensed broker-dealer agreement, its KYC/AML and funding APIs (replacing the sandbox flows), webhook handling, a secrets manager, and legal/compliance review. It also requires rebranding: real-money services cannot use another company’s name or trademarks.

## Testing

```bash
npm run typecheck && npm run lint && npm run build
npm run dev   # then, in another terminal:
npm run test:e2e
```

`scripts/e2e-test.ts` runs 94 checks against a live server. They cover registration, login, admin login, account management, deposits, purchases, sales, withdrawals, transaction history, statements, RBAC, CSRF, MFA, password reset and rate limiting. It creates the first super admin via `/admin/setup` if none exists; otherwise set `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. It trips the admin-login rate limit at the end, so wait 5 minutes (or clear the `RateLimit` table) before signing in as admin from the same IP.

## Project layout

```
prisma/            schema, migrations, demo seed
scripts/           admin bootstrap CLI, e2e tests
src/app/(site)     public pages: landing, TSLA, learn, FAQ, support, legal
src/app/(auth)     customer login / register / verify / reset
src/app/app        customer dashboard
src/app/admin      admin auth + (console) pages
src/app/api        REST endpoints (customer + /api/admin)
src/server         db, auth/session, permissions, security, broker adapter, services
src/components     UI kit, charts, shells, forms
src/proxy.ts       early redirects for unauthenticated /app and /admin visits
```
