# Tesla Investment — TSLA research, funding and simulated portfolio website

A full-stack, responsive **website** (not a mobile app) with a public site, a customer account area and a separate administrator console.

| Real today | Simulated today |
| --- | --- |
| Accounts, authentication, 2FA, identity-review workflow, support requests, audit log | TSLA prices (deterministic simulated feed) |
| Payment pipeline: deposit references, signed webhooks, independent verification, duplicate and failure handling | TSLA orders and holdings: no shares are bought on any exchange |
| Ledger with documented corrections and second-administrator approval for real money | All money, **while the test payment provider is active (the default)** |

The site is independent and **not affiliated with Tesla, Inc.**; that disclosure is fixed and cannot be removed from the admin console.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · PostgreSQL · Prisma 6 · server-side sessions (scrypt, TOTP 2FA, RBAC) · pdf-lib statements.

## Run it locally

```bash
cp .env.example .env     # set DATABASE_URL, ADMIN_SETUP_TOKEN (32+ random chars), TEST_PAYMENTS_WEBHOOK_SECRET
npm install
npx prisma migrate deploy
npm run db:seed          # optional demo customers (emails end @demo.example); prints their password
npm run dev              # http://localhost:3000
```

Emails (verification, password reset) are captured at **`/dev/mailbox`** until SMTP is wired into `src/server/mailer.ts`; set `SANDBOX_MAILBOX=false` in production.

## Administrator access

There is no default admin password. Create the first **super administrator** once, either:

1. at **`/admin/setup`**, entering the `ADMIN_SETUP_TOKEN` from the server environment (the page disables itself afterwards), or
2. from the CLI: `ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='Long-Unique-Passphrase-1' npm run admin:create`.

Then sign in at **`/admin/login`** (separate from customer login; customer accounts are refused there) and enable two-factor authentication under *My security*. Further admins are created under *Administrators* with roles (`SUPPORT`, `ADMIN`, `SUPER_ADMIN`) and per-permission toggles.

## Website map

**Public:** `/` home · `/about` · `/markets` (TSLA overview, statistics, risk) · `/learn` (investment information) · `/faq` · `/support` · `/legal/*` · `/register` · `/login`.

**Customer account (`/account`):** overview · portfolio · trade · add funds · withdraw · activity · statements (PDF) · identity verification · support requests · profile and security.

**Admin console (`/admin`):** overview · customers (search, open, suspend, flag, notes, sign-out, balance corrections) · identity reviews · support requests · deposits · withdrawals · transactions (CSV export) · balance corrections · payment provider · website content (homepage, announcements, notifications, FAQ, support info, investment info, maintenance mode) · settings (name, logo, appearance, fees, limits, admin 2FA policy) · administrators and permissions · audit log.

## Payments

All payments go through a provider integration layer in `src/server/payments/`:

| Piece | What it does |
| --- | --- |
| `types.ts` | `PaymentProvider` interface: create checkout, verify webhook, retrieve session, refund |
| `test-provider.ts` | Built-in test provider with its own payment records and signed webhooks (default) |
| `stripe-provider.ts` | Stripe Checkout: cards and US bank account (ACH) debits, refunds, REST over `fetch` |
| `service.ts` | Deposit lifecycle, webhook processing, verification, duplicate/failure handling, refunds |

**Deposit flow.** The customer picks an amount and method → a `DepositRequest` with a unique reference is created (client idempotency key prevents double submission) → card: redirect to the provider's hosted checkout; bank: payment instructions quoting the reference → the provider sends a webhook to `/api/webhooks/payments/<provider>` → the platform **(1)** verifies the HMAC signature over the raw body, **(2)** stores the event with a unique `(provider, eventId)` (replays are ignored), **(3)** re-reads the payment **from the provider's API**, **(4)** checks live/test mode and currency, then **(5)** atomically marks the deposit `SUCCEEDED`, writes one ledger entry (unique link, so it can never be credited twice) and credits the amount actually received. Failed, expired and cancelled payments are recorded with reasons and the customer is notified.

There is **no "mark as paid" button** anywhere. Admins can only *re-check with provider*. Screenshots, receipts or manual confirmations are never accepted.

**Withdrawals.** Admin approval required. In test mode payouts are simulated; with live payments the money is returned to the customer's original payment method through provider refunds (refund-to-source).

**Trading safety.** If live payments are enabled while the broker is the simulated one, trading is disabled: real money never buys simulated shares.

### Test mode (default)

`PAYMENT_PROVIDER="test"`. Card deposits open a test checkout page with Stripe-style test cards (succeed / declined / insufficient funds); bank-transfer deposits show test instructions plus a *simulate transfer received* button. Admins also get a payment simulator under *Payment provider* (including a different-amount transfer). Every simulated payment still goes through the signed-webhook → verification pipeline.

### Activating real payments (Stripe)

1. Create a Stripe account and complete its business verification. Investment-related businesses typically need Stripe's explicit approval.
2. In the server environment (never in browser code): `PAYMENT_PROVIDER="stripe"`, `STRIPE_SECRET_KEY="sk_test_..."`, `APP_URL="https://your-domain"`.
3. In Stripe → Developers → Webhooks, add `https://your-domain/api/webhooks/payments/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; put its signing secret in `STRIPE_WEBHOOK_SECRET="whsec_..."`.
4. Test end to end with `sk_test_` keys and Stripe's test cards / test bank accounts.
5. Going live requires **all** of: `sk_live_` key, `PAYMENTS_LIVE_ENABLED="true"`, and a platform name that does not use a third party's trademark (live payments refuse to start while the name contains "Tesla"). The admin *Payment provider* page shows this checklist.

**Legal prerequisites (not solvable in code).** Accepting customer money for investment generally requires a licensed broker-dealer (or a partnership such as Alpaca Broker API / DriveWealth, whose adapters are stubbed in `src/server/broker/licensed.ts`), money-transmission / e-money permissions or a provider that holds funds for you, a KYC/AML provider (the built-in identity review is a workflow, not document verification), and legal review of terms, privacy and marketing. Do not enable live payments before these are in place.

## Balance corrections

`/admin/adjustments` or the customer page. Every correction is an `ADJUSTMENT` ledger entry with a reason, never an in-place edit.

- **Demo / test mode:** applied immediately by an admin with `ledger:adjust` (manage simulated balances).
- **Live mode:** requires a supporting reference and approval by a **different** admin with `ledger:approve` (four-eyes).

## Security

Separate customer/admin sessions bound to role; hashed session tokens; scrypt passwords; lockout after failed logins; TOTP 2FA with optional mandatory policy for admins; PostgreSQL-backed rate limiting; Origin checks + JSON-only mutations; zod validation on every input; CSV formula-injection escaping; security headers; atomic conditional ledger updates; audit log for every sensitive action; webhook signature verification with timestamp tolerance; provider secrets server-only.

## Testing

```bash
npm run typecheck && npm run lint && npm run build
npm run dev            # in another terminal
npm run test:e2e       # 124 checks against the running server
```

The e2e script covers registration, verification, login, admin setup/login, admin route isolation, deposits (bad signatures, spoofed-but-signed events, duplicate events, declined cards, cancellations, under-paid transfers, re-checks), KYC, buys, sells, withdrawals (approve/reject/cancel/refund), history, PDF statements, balance corrections, support requests, RBAC, CSRF, MFA, password reset and rate limiting. If a super admin already exists, set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`. It trips the admin-login rate limit at the end (wait 5 minutes or clear the `RateLimit` table).
