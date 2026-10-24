-- 0005: payments, webhooks, idempotency, durable jobs, reconciliation, fees, support, compliance ops
CREATE TABLE payment_methods (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  provider           text NOT NULL,
  provider_method_id text NOT NULL,
  type               text NOT NULL CHECK (type IN ('bank_account','card','mobile_money','wallet')),
  label              text NOT NULL,
  last4              char(4),
  currency           char(3) NOT NULL REFERENCES currencies(code),
  -- Withdrawals only go back to methods that are verified and owned by the customer.
  status             text NOT NULL DEFAULT 'pending_verification'
                     CHECK (status IN ('pending_verification','verified','disabled')),
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_method_id)
);

CREATE TABLE deposits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  payment_method_id   uuid REFERENCES payment_methods(id),
  amount_minor        bigint NOT NULL CHECK (amount_minor > 0),
  fee_minor           bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  currency            char(3) NOT NULL REFERENCES currencies(code),
  provider            text NOT NULL,
  provider_payment_id text,
  idempotency_key     text NOT NULL,
  status              text NOT NULL CHECK (status IN ('initiated','pending','settled','failed','returned','canceled')),
  failure_reason      text,
  settled_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (provider, provider_payment_id)
);
CREATE TRIGGER deposits_touch BEFORE UPDATE ON deposits FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE withdrawals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  payment_method_id  uuid NOT NULL REFERENCES payment_methods(id),
  amount_minor       bigint NOT NULL CHECK (amount_minor > 0),
  fee_minor          bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  currency           char(3) NOT NULL REFERENCES currencies(code),
  provider           text NOT NULL,
  provider_payout_id text,
  idempotency_key    text NOT NULL,
  status             text NOT NULL CHECK (status IN (
                       'pending_review','approved','processing','completed','failed','rejected','canceled')),
  requires_review    boolean NOT NULL,
  reviewed_by        uuid REFERENCES staff_users(id),
  reviewed_at        timestamptz,
  review_note        text,
  failure_reason     text,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (provider, provider_payout_id)
);
CREATE TRIGGER withdrawals_touch BEFORE UPDATE ON withdrawals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX withdrawals_review ON withdrawals(status) WHERE status = 'pending_review';

-- Raw inbound provider events, stored before processing; unique per provider event id.
CREATE TABLE webhook_events (
  id                bigserial PRIMARY KEY,
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  event_type        text NOT NULL,
  signature_valid   boolean NOT NULL,
  payload           jsonb NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  processing_error  text,
  UNIQUE (provider, provider_event_id)
);

-- API-level idempotency: replay the stored response for a repeated key with the same request body.
CREATE TABLE idempotency_records (
  subject_id      uuid NOT NULL,
  scope           text NOT NULL,
  key             text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  request_hash    text NOT NULL,
  status          text NOT NULL CHECK (status IN ('in_progress','completed')),
  response_code   integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_id, scope, key)
);

-- Durable job queue (Postgres SKIP LOCKED). Enqueued in the same transaction as the state change.
CREATE TABLE jobs (
  id           bigserial PRIMARY KEY,
  queue        text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','dead')),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  dedupe_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX jobs_ready ON jobs(queue, run_at) WHERE status = 'pending';
CREATE UNIQUE INDEX jobs_dedupe ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('pending','running');

CREATE TABLE reconciliation_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('cash','positions','orders','payments')),
  status      text NOT NULL CHECK (status IN ('running','completed','failed')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE reconciliation_breaks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES reconciliation_runs(id),
  kind                 text NOT NULL,
  user_id              uuid REFERENCES users(id),
  brokerage_account_id uuid REFERENCES brokerage_accounts(id),
  reference            text,
  expected             text,
  actual               text,
  difference           text,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  resolved_by          uuid REFERENCES staff_users(id),
  resolved_at          timestamptz,
  resolution_note      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recon_resolution CHECK (status <> 'resolved' OR (resolved_by IS NOT NULL AND resolution_note IS NOT NULL))
);
CREATE INDEX recon_breaks_open ON reconciliation_breaks(status) WHERE status <> 'resolved';

-- Versioned fee schedules with maker-checker activation.
CREATE TABLE fee_schedules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                integer NOT NULL UNIQUE,
  status                 text NOT NULL CHECK (status IN ('draft','active','retired')),
  currency               char(3) NOT NULL REFERENCES currencies(code),
  commission_bps         integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 500),
  commission_min_minor   bigint NOT NULL CHECK (commission_min_minor >= 0),
  commission_max_minor   bigint CHECK (commission_max_minor IS NULL OR commission_max_minor >= commission_min_minor),
  fx_spread_bps          integer NOT NULL DEFAULT 0 CHECK (fx_spread_bps BETWEEN 0 AND 500),
  deposit_fee_minor      bigint NOT NULL DEFAULT 0 CHECK (deposit_fee_minor >= 0),
  withdrawal_fee_minor   bigint NOT NULL DEFAULT 0 CHECK (withdrawal_fee_minor >= 0),
  notes                  text,
  created_by             uuid REFERENCES staff_users(id),
  approved_by            uuid REFERENCES staff_users(id),
  activated_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_maker_checker CHECK (approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by),
  CONSTRAINT fee_active_approved CHECK (status <> 'active' OR activated_at IS NOT NULL)
);
CREATE UNIQUE INDEX fee_schedules_one_active ON fee_schedules(currency) WHERE status = 'active';

-- Global kill switches. Default OFF for anything involving money.
CREATE TABLE platform_controls (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL,
  reason     text,
  updated_by uuid REFERENCES staff_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Production launch gates: real-money mode refuses to start until every gate has two distinct approvals.
CREATE TABLE launch_gates (
  key         text PRIMARY KEY,
  category    text NOT NULL,
  title       text NOT NULL,
  description text NOT NULL,
  required_approvals smallint NOT NULL DEFAULT 2 CHECK (required_approvals >= 2)
);
CREATE TABLE launch_gate_approvals (
  gate_key     text NOT NULL REFERENCES launch_gates(key),
  staff_id     uuid NOT NULL REFERENCES staff_users(id),
  evidence_ref text NOT NULL CHECK (length(evidence_ref) >= 3),
  approved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gate_key, staff_id)
);
CREATE TRIGGER launch_gate_approvals_append_only BEFORE UPDATE OR DELETE ON launch_gate_approvals
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE support_tickets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          text NOT NULL UNIQUE,
  user_id            uuid NOT NULL REFERENCES users(id),
  subject            text NOT NULL CHECK (length(subject) BETWEEN 3 AND 200),
  category           text NOT NULL CHECK (category IN ('account','onboarding','funding','trading','technical','complaint','other')),
  is_complaint       boolean NOT NULL DEFAULT false,
  complaint_deadline timestamptz,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_customer','pending_internal','resolved','closed')),
  priority           text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to        uuid REFERENCES staff_users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaint_deadline_set CHECK (NOT is_complaint OR complaint_deadline IS NOT NULL)
);
CREATE TRIGGER support_tickets_touch BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE ticket_messages (
  id          bigserial PRIMARY KEY,
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id),
  author_type text NOT NULL CHECK (author_type IN ('customer','staff','system')),
  author_id   uuid,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  internal    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_messages_public CHECK (author_type <> 'customer' OR NOT internal)
);
CREATE TRIGGER ticket_messages_append_only BEFORE UPDATE OR DELETE ON ticket_messages
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);

-- Transaction-monitoring alerts. External regulatory filings (e.g. SAR/STR) are tracked by reference only.
CREATE TABLE monitoring_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  rule          text NOT NULL,
  severity      text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','escalated','closed_no_action','closed_reported')),
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    text UNIQUE,
  assigned_to   uuid REFERENCES staff_users(id),
  closed_by     uuid REFERENCES staff_users(id),
  closed_at     timestamptz,
  closure_note  text,
  external_filing_ref text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_closure CHECK (status NOT LIKE 'closed_%' OR (closed_by IS NOT NULL AND closure_note IS NOT NULL))
);
CREATE INDEX alerts_open ON monitoring_alerts(status, severity) WHERE status NOT LIKE 'closed_%';

-- Dev/sandbox-only outbound email capture (production uses a real ESP via the mailer adapter).
CREATE TABLE outbound_emails (
  id         bigserial PRIMARY KEY,
  to_address citext NOT NULL,
  template   text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
