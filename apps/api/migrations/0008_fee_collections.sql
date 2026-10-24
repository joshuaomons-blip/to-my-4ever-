-- 0008: track collection of platform commissions from the customer's partner account into the firm account.
CREATE TABLE fee_collections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id         uuid NOT NULL UNIQUE REFERENCES executions(id),
  brokerage_account_id uuid NOT NULL REFERENCES brokerage_accounts(id),
  amount_minor         bigint NOT NULL CHECK (amount_minor > 0),
  currency             char(3) NOT NULL,
  provider_transfer_id text,
  status               text NOT NULL CHECK (status IN ('pending','collected','failed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  collected_at         timestamptz
);
CREATE INDEX fee_collections_pending ON fee_collections(brokerage_account_id) WHERE status <> 'collected';
