-- 0002: customer profile, onboarding, KYC, sanctions screening, disclosures
CREATE TABLE customer_profiles (
  user_id                 uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  legal_first_name        text CHECK (length(legal_first_name) <= 100),
  legal_last_name         text CHECK (length(legal_last_name) <= 100),
  date_of_birth           date,
  nationality             char(2) REFERENCES jurisdictions(code),
  residence_country       char(2) REFERENCES jurisdictions(code),
  address_line1           text,
  address_line2           text,
  city                    text,
  region                  text,
  postal_code             text,
  phone                   text,
  tax_id_enc              text,
  tax_id_last4            char(4),
  employment_status       text CHECK (employment_status IN ('employed','self_employed','unemployed','retired','student')),
  annual_income_band      text,
  net_worth_band          text,
  investment_experience   text CHECK (investment_experience IN ('none','limited','good','extensive')),
  risk_tolerance          text CHECK (risk_tolerance IN ('conservative','moderate','aggressive')),
  funding_source          text,
  is_politically_exposed  boolean,
  is_control_person       boolean,
  is_affiliated_exchange  boolean,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER customer_profiles_touch BEFORE UPDATE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE onboarding_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL UNIQUE REFERENCES users(id),
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN (
                         'draft','submitted','kyc_pending','manual_review','approved','rejected','ineligible')),
  eligibility_snapshot jsonb,
  submitted_at         timestamptz,
  decided_at           timestamptz,
  decided_by           uuid REFERENCES staff_users(id),
  decision_source      text CHECK (decision_source IN ('automatic','staff')),
  decision_reason      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_decided CHECK (
    status NOT IN ('approved','rejected') OR (decided_at IS NOT NULL AND decision_source IS NOT NULL))
);
CREATE TRIGGER onboarding_touch BEFORE UPDATE ON onboarding_applications
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX onboarding_status ON onboarding_applications(status, submitted_at);

-- Versioned legal documents and the customer's acceptance of each version.
CREATE TABLE legal_documents (
  key          text NOT NULL,
  version      text NOT NULL,
  title        text NOT NULL,
  jurisdiction char(2) REFERENCES jurisdictions(code),
  published_at timestamptz NOT NULL DEFAULT now(),
  content_sha256 text NOT NULL,
  PRIMARY KEY (key, version)
);

CREATE TABLE disclosure_acceptances (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id),
  document_key     text NOT NULL,
  document_version text NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  ip               inet,
  user_agent       text,
  FOREIGN KEY (document_key, document_version) REFERENCES legal_documents(key, version),
  UNIQUE (user_id, document_key, document_version)
);
CREATE TRIGGER disclosure_acceptances_append_only BEFORE UPDATE OR DELETE ON disclosure_acceptances
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE kyc_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id     uuid NOT NULL REFERENCES onboarding_applications(id),
  provider           text NOT NULL,
  provider_reference text NOT NULL,
  status             text NOT NULL CHECK (status IN ('pending','clear','consider','rejected','error')),
  result             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference)
);
CREATE TRIGGER kyc_checks_touch BEFORE UPDATE ON kyc_checks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE screening_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  provider     text NOT NULL,
  list_version text,
  status       text NOT NULL CHECK (status IN ('clear','potential_match','confirmed_match','false_positive','error')),
  matches      jsonb NOT NULL DEFAULT '[]'::jsonb,
  screened_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_by  uuid REFERENCES staff_users(id),
  reviewed_at  timestamptz,
  review_note  text,
  CONSTRAINT screening_review_complete CHECK (
    status NOT IN ('confirmed_match','false_positive') OR (reviewed_by IS NOT NULL AND review_note IS NOT NULL))
);
CREATE INDEX screening_user ON screening_results(user_id, screened_at DESC);
