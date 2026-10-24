# API guide

The full, generated reference is [openapi.json](openapi.json) (also served at `/docs` outside
production). Regenerate with `pnpm --filter @aureon/api openapi`; CI fails if it drifts.

## Conventions

- Base path `/v1`. Browsers call through the app's same-origin proxy at `/api/v1/...`.
- **Auth**: HttpOnly session cookie (`aur_sid` customer, `aur_staff_sid` staff; `__Host-` prefixed when
  secure). Sessions have idle and absolute expiry and are revocable.
- **CSRF**: every non-GET request must send `X-CSRF-Token` equal to the `aur_csrf` / `aur_staff_csrf`
  cookie; the token is bound to the session (hash stored server-side).
- **MFA**: if enabled (mandatory before onboarding submission, always for staff), new sessions must call
  `POST /v1/auth/mfa/verify`. Sensitive actions return `403 STEP_UP_REQUIRED` unless
  `POST /v1/auth/step-up` (staff: `/v1/admin/auth/step-up`) succeeded within `STEP_UP_WINDOW_SECONDS`.
- **Idempotency**: `POST /v1/orders`, `/v1/funding/deposits`, `/v1/funding/withdrawals` require an
  `Idempotency-Key` header (8–128 chars). Repeating a key with the same body replays the original response
  (`idempotent-replayed: true`); a different body returns `422 IDEMPOTENCY_KEY_REUSED`.
- **Money**: decimal strings with currency, e.g. `{"amount":"125.40","currency":"USD"}`. Quantities are
  decimal strings. Never floats.
- **Errors**: `{"error":{"code":"INSUFFICIENT_FUNDS","message":"...","requestId":"...","details":{}}}`.
  Every response carries `x-request-id` for support and log correlation.
- **Rate limits**: `429 RATE_LIMITED`. Authentication and money-movement routes fail closed if the
  limiter is unavailable.

## Main resources

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register, /verify-email, /login, /mfa/verify, /step-up, /logout, /password/forgot, /password/reset, /password/change, /mfa/setup, /mfa/enable`; `GET /auth/session, /auth/sessions` |
| Onboarding | `GET /onboarding`, `PUT /onboarding/profile`, `POST /onboarding/disclosures, /onboarding/submit` |
| Markets | `GET /instruments, /instruments/{symbol}, /quotes/{symbol}, /quotes?symbols=, /bars/{symbol}?range=`, watchlists |
| Orders | `POST /orders/preview`, `POST /orders`, `GET /orders`, `GET /orders/{id}`, `GET /orders/{id}/confirmation`, `POST /orders/{id}/cancel` |
| Portfolio | `GET /portfolio`, `GET /portfolio/history` |
| Funding | `GET /funding`, `POST /funding/methods, /funding/deposits, /funding/withdrawals, /funding/withdrawals/{id}/cancel` |
| Records | `GET /activity, /documents, /dividends, /notifications` |
| Support | `GET/POST /support/tickets`, `GET /support/tickets/{id}`, `POST /support/tickets/{id}/messages` |
| Public | `GET /public/platform, /public/jurisdictions, /public/documents, /public/fees` |
| Webhooks | `POST /webhooks/payments/{provider}` (signature `x-sandbox-signature: t=<unix>,v1=<hmac-sha256(t.body)>`), `POST /webhooks/broker` |
| Admin | `/admin/*` — see OpenAPI; every route declares its permission; sensitive routes require step-up |
| Health | `GET /healthz` (liveness), `GET /readyz` (readiness) |

Quotes include `asOf` (source timestamp), `ageSeconds`, `stale`, `source`, `delayed`, `simulated`.
Clients must display the timestamp and the simulated/delayed state.
