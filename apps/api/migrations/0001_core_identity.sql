-- 0001: extensions, reference data, identities, sessions, audit log
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Generic guard used to make financial/audit tables append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only (% not permitted)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END $$;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TABLE currencies (
  code      char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name      text NOT NULL,
  exponent  smallint NOT NULL CHECK (exponent BETWEEN 0 AND 4)
);

-- Operating permissions per country. Everything defaults to BLOCKED; a country only becomes
-- usable when compliance staff explicitly enable it after legal review.
CREATE TABLE jurisdictions (
  code                 char(2) PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name                 text NOT NULL,
  region               text NOT NULL,
  status               text NOT NULL DEFAULT 'blocked'
                       CHECK (status IN ('blocked', 'waitlist', 'sandbox_only', 'live')),
  onboarding_enabled   boolean NOT NULL DEFAULT false,
  trading_enabled      boolean NOT NULL DEFAULT false,
  deposits_enabled     boolean NOT NULL DEFAULT false,
  withdrawals_enabled  boolean NOT NULL DEFAULT false,
  broker_provider      text,
  payment_providers    text[] NOT NULL DEFAULT '{}',
  allowed_currencies   text[] NOT NULL DEFAULT '{}',
  min_age              smallint NOT NULL DEFAULT 18 CHECK (min_age >= 18),
  requires_tax_id      boolean NOT NULL DEFAULT true,
  legal_review_ref     text,
  notes                text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  -- A blocked or waitlisted country may never have any capability switched on.
  CONSTRAINT jurisdiction_blocked_has_no_capabilities CHECK (
    status IN ('sandbox_only', 'live')
    OR NOT (onboarding_enabled OR trading_enabled OR deposits_enabled OR withdrawals_enabled)
  ),
  -- Live status requires a recorded legal review reference.
  CONSTRAINT jurisdiction_live_requires_review CHECK (status <> 'live' OR legal_review_ref IS NOT NULL)
);
CREATE TRIGGER jurisdictions_touch BEFORE UPDATE ON jurisdictions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               citext NOT NULL UNIQUE,
  email_verified_at   timestamptz,
  password_hash       text NOT NULL,
  display_name        text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  residence_country   char(2) REFERENCES jurisdictions(code),
  base_currency       char(3) NOT NULL DEFAULT 'USD' REFERENCES currencies(code),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'locked', 'suspended', 'closed')),
  mfa_enabled         boolean NOT NULL DEFAULT false,
  mfa_secret_enc      text,
  mfa_pending_secret_enc text,
  failed_login_count  integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_mfa_secret_present CHECK (NOT mfa_enabled OR mfa_secret_enc IS NOT NULL)
);
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE user_recovery_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_recovery_codes_user ON user_recovery_codes(user_id) WHERE used_at IS NULL;

CREATE TABLE email_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Back-office identities are separate from customers on purpose.
CREATE TABLE staff_users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               citext NOT NULL UNIQUE,
  password_hash       text NOT NULL,
  display_name        text NOT NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'disabled')),
  mfa_enabled         boolean NOT NULL DEFAULT false,
  mfa_secret_enc      text,
  mfa_pending_secret_enc text,
  failed_login_count  integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_users_touch BEFORE UPDATE ON staff_users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE staff_roles (
  staff_id   uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN (
               'super_admin', 'compliance_officer', 'operations', 'finance', 'support_agent', 'auditor')),
  granted_by uuid REFERENCES staff_users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, role)
);

CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type    text NOT NULL CHECK (subject_type IN ('customer', 'staff')),
  subject_id      uuid NOT NULL,
  token_hash      bytea NOT NULL UNIQUE,
  csrf_token_hash bytea NOT NULL,
  mfa_required    boolean NOT NULL,
  mfa_verified_at timestamptz,
  step_up_at      timestamptz,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at      timestamptz,
  revoke_reason   text
);
CREATE INDEX sessions_subject ON sessions(subject_type, subject_id) WHERE revoked_at IS NULL;

-- Tamper-evident audit log: each row carries a SHA-256 chained over the previous row's hash.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type  text NOT NULL CHECK (actor_type IN ('customer', 'staff', 'system', 'provider', 'anonymous')),
  actor_id    text,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  outcome     text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure', 'denied')),
  ip          inet,
  user_agent  text,
  request_id  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   bytea,
  hash        bytea NOT NULL
);
CREATE INDEX audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX audit_log_actor ON audit_log(actor_type, actor_id);
CREATE INDEX audit_log_action ON audit_log(action, occurred_at DESC);

-- Timezone-independent timestamp rendering for hashing.
CREATE OR REPLACE FUNCTION audit_ts(t timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_hash bytea;
BEGIN
  -- Serialise writers so the chain is linear.
  PERFORM pg_advisory_xact_lock(727401);
  SELECT hash INTO last_hash FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.hash := digest(
    coalesce(encode(last_hash, 'hex'), '') || '|' || audit_ts(NEW.occurred_at) || '|' || NEW.actor_type || '|' ||
    coalesce(NEW.actor_id, '') || '|' || NEW.action || '|' || coalesce(NEW.target_type, '') || '|' ||
    coalesce(NEW.target_id, '') || '|' || NEW.outcome || '|' || NEW.metadata::text,
    'sha256');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
