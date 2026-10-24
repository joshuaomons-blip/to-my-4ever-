# Brokerage partner options

Research performed 2026-10-24. **Verify everything here directly with each provider and with counsel
before committing** — availability by customer country, pricing and contract terms change and were not
fully visible in public material. Nothing here asserts that a provider will accept this business.

## Shortlist

| Provider | What public material shows | Fit | Evidence |
|---|---|---|---|
| **Alpaca — Broker API** | Brokerage-as-a-service API: account opening, trading via `POST /v1/trading/accounts/{account_id}/orders` returning an order with `id` and `client_order_id`; replayable **Server-Sent Event** streams for account status, trades, journals and transfers (`/v1/events/...`, resumable by id/time); separate sandbox environment. Alpaca also documents EU and GIFT City (India) broker offerings. | Best first integration: self-serve sandbox, developer docs, US equities/ETFs incl. fractional. Confirm which customer countries (UK, EEA, Nigeria) Alpaca will onboard under your model. | [Getting started](https://docs.alpaca.markets/docs/getting-started-with-broker-api), [SSE events](https://docs.alpaca.markets/eu/docs/sse-events), [alpaca-py sandbox mode](https://www.pypi.org/project/alpaca-py/0.7.2/), [older broker docs](https://alpaca.markets/docs/broker/get-started/) |
| **Interactive Brokers — introducing broker / white branding** | Web API split into Account Management (create accounts, update info, cash transfers, statements, tax forms) and Trading. White-branding of registration, client portal and emails for registered advisors and introducing brokers (fully disclosed and non-disclosed). | Broadest country coverage; heavier onboarding and typically requires the platform to be a regulated introducing broker or advisor. | [Web API intro](https://www.interactivebrokers.com/docs/web-api/introduction.md), [Account management](https://www.interactivebrokers.com/docs/web-api/account-management/account-management-introduction/introduction), [Registration options](https://www.interactivebrokers.com/docs/web-api/account-management/resources/registration-options), [White branding](https://interactivebrokers.com/campus/trading-lessons/white-branding-for-introducing-brokers), [Services agreement (PDF)](https://www.interactivebrokers.com/campus/wp-content/uploads/sites/2/2024/09/Web-API-Account-Management-Services-Agreement.pdf) |
| **DriveWealth** | B2B brokerage-as-a-service (REST, FIX) for partners in the US, LatAm, EMEA and APAC; third-party profiles say it holds licences in the US, Singapore and Lithuania. Developer docs not publicly indexed. | Commonly used by international consumer apps offering US stocks (relevant for Nigeria). Sales-led. | [Company site](https://www.drivewealth.com/), [Sacra profile](https://sacra.com/c/drivewealth/) (secondary) |
| **Upvest** | Investment API (brokerage, settlement, custody) for EU fintechs; BaFin-regulated; third-party profile reports UK FCA authorisation (2024). | Candidate for an EU/EEA operating model with EU-domiciled products. Sales-led. | [Upvest blog](https://upvest.co/blog/series-b), [Dealroom profile](https://app.dealroom.co/companies/upvest) (secondary) |

## Adapter status in this repository

`apps/api/src/brokerage/alpaca-broker.adapter.ts` implements the `BrokerAdapter` contract.

| Capability | Endpoint used | Evidence |
|---|---|---|
| Submit order | `POST /v1/trading/accounts/{id}/orders` with `client_order_id` | **Confirmed** in Alpaca docs |
| Event streams | `/v1/events/trades`, `/accounts/status`, `/journals/status`, `/transfers/status` (SSE) | **Confirmed**; SSE consumer not yet built — orders are synced by polling + resolver jobs meanwhile |
| Open account | `POST /v1/accounts` (contact, identity, disclosures, agreements) | Payload shape **to verify** against current reference |
| Account / trading account / positions | `GET /v1/accounts/{id}`, `GET /v1/trading/accounts/{id}/account`, `.../positions` | **To verify** |
| Fills, activities | `GET /v1/accounts/activities/FILL`, `GET /v1/accounts/activities?activity_types=...` | **To verify** |
| Documents | `GET /v1/accounts/{id}/documents` | **To verify** |
| Cash journals (funding / fees / withdrawals) | `POST /v1/journals` (`JNLC`) from a firm account | **To verify**; requires firm account set-up and the agreed funds-flow model |

Contract tests (`alpaca-broker.adapter.spec.ts`) verify request construction, auth, retry policy
(reads retried, writes never blindly retried) and status mapping against a mocked HTTP layer. Before
enabling `BROKER_PROVIDER=alpaca`, run the integration suite against the Alpaca sandbox with real
sandbox keys and fix any field mismatches.

## Selection criteria to put to each provider

1. Which customer **residence countries** will you onboard under our model (US, UK, each EEA state, Nigeria)?
2. Fully disclosed vs omnibus; who is the **customer's contractual counterparty**; who performs **KYC/AML** and sanctions screening; who files SARs/STRs.
3. Client-money / client-asset protection and **investor compensation** coverage per country.
4. Funding rails per country and currency; FX conversion and who discloses spreads.
5. Statements, trade confirmations and **tax forms** (e.g. W-8BEN / 1042-S for non-US persons).
6. Webhook/stream semantics: idempotency keys, replay, ordering, signature scheme.
7. Sandbox fidelity (partial fills, rejections, corporate actions), rate limits, SLAs, incident communication.
8. Pricing: per-account, per-trade, minimums, market data pass-through.
