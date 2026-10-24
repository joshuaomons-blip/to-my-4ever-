-- 0003: brokerage accounts (held at licensed partner), instruments, orders, executions, holdings
CREATE TABLE brokerage_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id),
  provider             text NOT NULL,
  provider_account_id  text,
  account_number       text,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN (
                         'pending','submitted','action_required','active','restricted','rejected','closed')),
  currency             char(3) NOT NULL REFERENCES currencies(code),
  last_synced_at       timestamptz,
  opened_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider),
  UNIQUE (provider, provider_account_id)
);
CREATE TRIGGER brokerage_accounts_touch BEFORE UPDATE ON brokerage_accounts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Point-in-time snapshots reported by the partner. The partner is authoritative.
CREATE TABLE broker_account_snapshots (
  id                   bigserial PRIMARY KEY,
  brokerage_account_id uuid NOT NULL REFERENCES brokerage_accounts(id),
  cash                 numeric(20,4) NOT NULL,
  buying_power         numeric(20,4) NOT NULL,
  equity               numeric(20,4) NOT NULL,
  currency             char(3) NOT NULL,
  as_of                timestamptz NOT NULL,
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX broker_snapshots_latest ON broker_account_snapshots(brokerage_account_id, as_of DESC);
CREATE TRIGGER broker_snapshots_append_only BEFORE UPDATE OR DELETE ON broker_account_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE account_restrictions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL CHECK (type IN ('trading_block','deposit_block','withdrawal_block','full_freeze','close_only')),
  reason      text NOT NULL CHECK (length(reason) >= 5),
  created_by  uuid REFERENCES staff_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  lifted_at   timestamptz,
  lifted_by   uuid REFERENCES staff_users(id),
  lift_reason text,
  CONSTRAINT restriction_lift_complete CHECK (
    lifted_at IS NULL OR (lifted_by IS NOT NULL AND lift_reason IS NOT NULL)),
  CONSTRAINT restriction_four_eyes CHECK (lifted_by IS NULL OR created_by IS NULL OR lifted_by <> created_by)
);
CREATE INDEX restrictions_active ON account_restrictions(user_id) WHERE lifted_at IS NULL;
-- Restrictions are never deleted; lifting is recorded instead.
CREATE TRIGGER restrictions_no_delete BEFORE DELETE ON account_restrictions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE instruments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol        text NOT NULL CHECK (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  exchange      text NOT NULL,
  name          text NOT NULL,
  asset_class   text NOT NULL CHECK (asset_class IN ('equity','etf')),
  currency      char(3) NOT NULL REFERENCES currencies(code),
  isin          text CHECK (isin IS NULL OR isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  country       char(2),
  sector        text,
  description   text,
  is_tradable   boolean NOT NULL DEFAULT true,
  fractionable  boolean NOT NULL DEFAULT false,
  -- e.g. PRIIPs: EU retail clients generally need a KID for US ETFs; gate per jurisdiction.
  restricted_jurisdictions char(2)[] NOT NULL DEFAULT '{}',
  provider_ids  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, exchange)
);
CREATE INDEX instruments_search ON instruments USING gin (to_tsvector('simple', symbol || ' ' || name));

CREATE TABLE watchlists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE TABLE watchlist_items (
  watchlist_id  uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES instruments(id),
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, instrument_id)
);

-- Latest holdings as reported by the partner (replaced on each sync, history kept in snapshots).
CREATE TABLE positions (
  brokerage_account_id uuid NOT NULL REFERENCES brokerage_accounts(id),
  instrument_id        uuid NOT NULL REFERENCES instruments(id),
  quantity             numeric(28,9) NOT NULL CHECK (quantity >= 0),
  avg_entry_price      numeric(20,8) NOT NULL CHECK (avg_entry_price >= 0),
  cost_basis           numeric(20,4) NOT NULL,
  as_of                timestamptz NOT NULL,
  source               text NOT NULL DEFAULT 'provider' CHECK (source = 'provider'),
  PRIMARY KEY (brokerage_account_id, instrument_id)
);

CREATE TABLE orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id),
  brokerage_account_id uuid NOT NULL REFERENCES brokerage_accounts(id),
  instrument_id        uuid NOT NULL REFERENCES instruments(id),
  client_order_id      text NOT NULL UNIQUE,
  idempotency_key      text NOT NULL,
  provider             text NOT NULL,
  provider_order_id    text,
  side                 text NOT NULL CHECK (side IN ('buy','sell')),
  type                 text NOT NULL CHECK (type IN ('market','limit','stop','stop_limit')),
  time_in_force        text NOT NULL CHECK (time_in_force IN ('day','gtc','ioc','fok')),
  quantity             numeric(28,9) NOT NULL CHECK (quantity > 0),
  limit_price          numeric(20,8) CHECK (limit_price > 0),
  stop_price           numeric(20,8) CHECK (stop_price > 0),
  currency             char(3) NOT NULL REFERENCES currencies(code),
  status               text NOT NULL CHECK (status IN (
                         'pending_submit','submitted','accepted','partially_filled','filled',
                         'pending_cancel','canceled','rejected','expired','failed')),
  filled_quantity      numeric(28,9) NOT NULL DEFAULT 0,
  avg_fill_price       numeric(20,8),
  estimated_price      numeric(20,8) NOT NULL,
  estimated_fee_minor  bigint NOT NULL DEFAULT 0 CHECK (estimated_fee_minor >= 0),
  hold_minor           bigint NOT NULL DEFAULT 0 CHECK (hold_minor >= 0),
  quote_snapshot       jsonb NOT NULL,
  reject_reason        text,
  submitted_at         timestamptz,
  terminal_at          timestamptz,
  version              integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (provider, provider_order_id),
  CONSTRAINT orders_fill_bounds CHECK (filled_quantity >= 0 AND filled_quantity <= quantity),
  CONSTRAINT orders_limit_price CHECK (type NOT IN ('limit','stop_limit') OR limit_price IS NOT NULL),
  CONSTRAINT orders_stop_price CHECK (type NOT IN ('stop','stop_limit') OR stop_price IS NOT NULL),
  CONSTRAINT orders_filled_complete CHECK (status <> 'filled' OR filled_quantity = quantity)
);
CREATE TRIGGER orders_touch BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX orders_user ON orders(user_id, created_at DESC);
CREATE INDEX orders_open ON orders(status) WHERE status IN ('pending_submit','submitted','accepted','partially_filled','pending_cancel');

CREATE TABLE order_events (
  id          bigserial PRIMARY KEY,
  order_id    uuid NOT NULL REFERENCES orders(id),
  event_type  text NOT NULL,
  from_status text,
  to_status   text,
  source      text NOT NULL CHECK (source IN ('customer','system','provider','staff')),
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order ON order_events(order_id, id);
CREATE TRIGGER order_events_append_only BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Executions exist ONLY when the licensed partner reports them. Never inserted from our own logic.
CREATE TABLE executions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id),
  provider              text NOT NULL,
  provider_execution_id text NOT NULL,
  side                  text NOT NULL CHECK (side IN ('buy','sell')),
  quantity              numeric(28,9) NOT NULL CHECK (quantity > 0),
  price                 numeric(20,8) NOT NULL CHECK (price > 0),
  gross_minor           bigint NOT NULL CHECK (gross_minor >= 0),
  fee_minor             bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  currency              char(3) NOT NULL,
  executed_at           timestamptz NOT NULL,
  settlement_date       date NOT NULL,
  settled_at            timestamptz,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_execution_id)
);
CREATE INDEX executions_order ON executions(order_id);
CREATE INDEX executions_unsettled ON executions(settlement_date) WHERE settled_at IS NULL;
CREATE OR REPLACE FUNCTION executions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'executions are append-only';
  END IF;
  -- Only the settlement timestamp may be set, once.
  IF (to_jsonb(NEW) - 'settled_at') <> (to_jsonb(OLD) - 'settled_at') OR OLD.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'executions are immutable except for first settlement stamp';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER executions_guard BEFORE UPDATE OR DELETE ON executions
  FOR EACH ROW EXECUTE FUNCTION executions_guard();

CREATE TABLE corporate_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid REFERENCES instruments(id),
  type          text NOT NULL CHECK (type IN ('cash_dividend','stock_dividend','split','reverse_split','merger','spinoff','name_change','symbol_change','other')),
  ex_date       date,
  record_date   date,
  pay_date      date,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider      text NOT NULL,
  provider_ref  text NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

-- Non-trade account activity reported by the partner (dividends, fees, interest, journals).
CREATE TABLE account_activities (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_account_id uuid NOT NULL REFERENCES brokerage_accounts(id),
  provider             text NOT NULL,
  provider_activity_id text NOT NULL,
  type                 text NOT NULL CHECK (type IN ('dividend','dividend_tax_withheld','interest','fee','corporate_action','journal','other')),
  amount_minor         bigint NOT NULL,
  currency             char(3) NOT NULL,
  instrument_id        uuid REFERENCES instruments(id),
  description          text,
  occurred_at          timestamptz NOT NULL,
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_activity_id)
);
CREATE TRIGGER account_activities_append_only BEFORE UPDATE OR DELETE ON account_activities
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id),
  kind                 text NOT NULL CHECK (kind IN ('trade_confirmation','account_statement','tax_form','other')),
  title                text NOT NULL,
  period_start         date,
  period_end           date,
  provider             text NOT NULL,
  provider_document_id text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_document_id)
);
CREATE INDEX documents_user ON documents(user_id, created_at DESC);
