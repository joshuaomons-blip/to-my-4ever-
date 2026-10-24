-- 0004: double-entry ledger for platform-recorded cash movements and fees.
-- Sign convention: posting.amount_minor > 0 is a DEBIT, < 0 is a CREDIT (integer minor units).
-- Customer cash accounts are liabilities of the platform (credit-normal), so a customer-facing
-- balance of 100.00 is stored as -10000.
CREATE TABLE ledger_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid REFERENCES users(id),
  type           text NOT NULL CHECK (type IN (
                   'customer_available',     -- settled cash the customer may trade or withdraw
                   'customer_pending',       -- deposits initiated but not yet settled
                   'customer_held',          -- reserved for open buy orders
                   'customer_unsettled',     -- sale proceeds awaiting settlement
                   'customer_withdrawal_hold', -- reserved for in-flight withdrawals
                   'customer_deficit',       -- amount owed by the customer (debit-normal; triggers an alert)
                   'platform_fee_revenue',
                   'payment_clearing',       -- receivable from payment providers
                   'broker_settlement')),    -- cash position with the brokerage partner
  currency       char(3) NOT NULL REFERENCES currencies(code),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  allow_negative boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_customer_owner CHECK ((type LIKE 'customer_%') = (owner_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX ledger_accounts_customer_unique ON ledger_accounts(owner_user_id, type, currency)
  WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX ledger_accounts_platform_unique ON ledger_accounts(type, currency)
  WHERE owner_user_id IS NULL;

CREATE TABLE journal_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   text NOT NULL UNIQUE,
  kind              text NOT NULL,
  description       text NOT NULL,
  reference_type    text,
  reference_id      text,
  reverses_entry_id uuid REFERENCES journal_entries(id),
  created_by_type   text NOT NULL CHECK (created_by_type IN ('system','staff','provider')),
  created_by_id     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_reference ON journal_entries(reference_type, reference_id);
CREATE UNIQUE INDEX journal_single_reversal ON journal_entries(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

CREATE TABLE ledger_postings (
  id                bigserial PRIMARY KEY,
  journal_entry_id  uuid NOT NULL REFERENCES journal_entries(id),
  ledger_account_id uuid NOT NULL REFERENCES ledger_accounts(id),
  amount_minor      bigint NOT NULL CHECK (amount_minor <> 0),
  currency          char(3) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX postings_account ON ledger_postings(ledger_account_id, id);
CREATE INDEX postings_journal ON ledger_postings(journal_entry_id);

CREATE TABLE ledger_balances (
  ledger_account_id uuid PRIMARY KEY REFERENCES ledger_accounts(id),
  balance_minor     bigint NOT NULL DEFAULT 0,
  version           bigint NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Apply a posting to the running balance atomically and enforce sign rules.
CREATE OR REPLACE FUNCTION ledger_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acct ledger_accounts%ROWTYPE; new_balance bigint;
BEGIN
  SELECT * INTO acct FROM ledger_accounts WHERE id = NEW.ledger_account_id;
  IF acct.currency <> NEW.currency THEN
    RAISE EXCEPTION 'posting currency % does not match account currency %', NEW.currency, acct.currency;
  END IF;
  INSERT INTO ledger_balances (ledger_account_id, balance_minor, version, updated_at)
    VALUES (NEW.ledger_account_id, NEW.amount_minor, 1, now())
  ON CONFLICT (ledger_account_id) DO UPDATE
    SET balance_minor = ledger_balances.balance_minor + EXCLUDED.balance_minor,
        version = ledger_balances.version + 1,
        updated_at = now()
  RETURNING balance_minor INTO new_balance;
  IF NOT acct.allow_negative AND (
       (acct.normal_balance = 'credit' AND new_balance > 0) OR
       (acct.normal_balance = 'debit'  AND new_balance < 0)) THEN
    RAISE EXCEPTION 'insufficient_funds: ledger account % (%) would become %', acct.id, acct.type, new_balance
      USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_apply_posting AFTER INSERT ON ledger_postings
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_posting();

-- Every journal entry must balance to zero per currency and have at least two postings.
CREATE OR REPLACE FUNCTION ledger_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad record; cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM ledger_postings WHERE journal_entry_id = NEW.journal_entry_id;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'journal entry % must have at least two postings', NEW.journal_entry_id;
  END IF;
  SELECT currency, sum(amount_minor) AS total INTO bad FROM ledger_postings
    WHERE journal_entry_id = NEW.journal_entry_id GROUP BY currency HAVING sum(amount_minor) <> 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'journal entry % is unbalanced in % by %', NEW.journal_entry_id, bad.currency, bad.total;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_check_balanced AFTER INSERT ON ledger_postings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();

-- Ledger history is immutable. Corrections are made with reversing entries.
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_postings_append_only BEFORE UPDATE OR DELETE ON ledger_postings
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER journal_entries_no_truncate BEFORE TRUNCATE ON journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_postings_no_truncate BEFORE TRUNCATE ON ledger_postings
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Balances may only change through the posting trigger.
CREATE OR REPLACE FUNCTION ledger_balances_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'ledger_balances may only be modified by posting trigger';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ledger_balances rows cannot be deleted'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_balances_guard BEFORE INSERT OR UPDATE OR DELETE ON ledger_balances
  FOR EACH ROW EXECUTE FUNCTION ledger_balances_guard();
