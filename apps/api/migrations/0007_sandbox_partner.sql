-- 0007: SANDBOX ONLY. Simulates the systems of a licensed brokerage partner so the platform can be
-- developed and tested end-to-end without real accounts, money or market access. Nothing in this
-- schema represents real trades. The platform's own tables only learn about "executions" through the
-- broker adapter interface, exactly as they would from a real partner.
CREATE SCHEMA IF NOT EXISTS sandbox_partner;

CREATE TABLE sandbox_partner.accounts (
  id             text PRIMARY KEY,
  account_number text NOT NULL UNIQUE,
  status         text NOT NULL,
  currency       char(3) NOT NULL,
  cash           numeric(20,4) NOT NULL DEFAULT 0,
  applicant      jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sandbox_partner.positions (
  account_id     text NOT NULL REFERENCES sandbox_partner.accounts(id),
  symbol         text NOT NULL,
  quantity       numeric(28,9) NOT NULL,
  avg_price      numeric(20,8) NOT NULL,
  PRIMARY KEY (account_id, symbol)
);
CREATE TABLE sandbox_partner.orders (
  id              text PRIMARY KEY,
  account_id      text NOT NULL REFERENCES sandbox_partner.accounts(id),
  client_order_id text NOT NULL UNIQUE,
  symbol          text NOT NULL,
  side            text NOT NULL,
  type            text NOT NULL,
  time_in_force   text NOT NULL,
  quantity        numeric(28,9) NOT NULL,
  limit_price     numeric(20,8),
  stop_price      numeric(20,8),
  status          text NOT NULL,
  filled_quantity numeric(28,9) NOT NULL DEFAULT 0,
  avg_fill_price  numeric(20,8),
  reject_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sandbox_partner.fills (
  id              text PRIMARY KEY,
  order_id        text NOT NULL REFERENCES sandbox_partner.orders(id),
  quantity        numeric(28,9) NOT NULL,
  price           numeric(20,8) NOT NULL,
  executed_at     timestamptz NOT NULL DEFAULT now(),
  settlement_date date NOT NULL
);
CREATE TABLE sandbox_partner.transfers (
  id          text PRIMARY KEY,
  account_id  text NOT NULL REFERENCES sandbox_partner.accounts(id),
  direction   text NOT NULL CHECK (direction IN ('credit','debit')),
  amount      numeric(20,4) NOT NULL,
  reference   text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sandbox_partner.activities (
  id          text PRIMARY KEY,
  account_id  text NOT NULL REFERENCES sandbox_partner.accounts(id),
  type        text NOT NULL,
  amount      numeric(20,4) NOT NULL,
  symbol      text,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
-- Fault injection switches for testing outages, latency and rejections.
CREATE TABLE sandbox_partner.faults (
  key   text PRIMARY KEY,
  value text NOT NULL
);
