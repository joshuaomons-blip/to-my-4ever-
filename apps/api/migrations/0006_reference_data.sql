-- 0006: reference data. Jurisdiction statuses are a STARTING POINT for sandbox testing only and are
-- NOT a legal determination. Nothing here is 'live'; going live requires counsel sign-off per country.
INSERT INTO currencies (code, name, exponent) VALUES
  ('USD','US Dollar',2), ('GBP','Pound Sterling',2), ('EUR','Euro',2), ('NGN','Nigerian Naira',2);

INSERT INTO jurisdictions (code, name, region, status, onboarding_enabled, trading_enabled, deposits_enabled,
                           withdrawals_enabled, broker_provider, payment_providers, allowed_currencies, notes) VALUES
  ('US','United States','north_america','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{USD}',
   'Requires a FINRA/SEC-registered broker-dealer partner (introducing or fully disclosed arrangement) and state-law review.'),
  ('GB','United Kingdom','europe','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{GBP,USD}',
   'Requires FCA authorisation or an appointed-representative arrangement; financial promotions regime applies.'),
  ('DE','Germany','eea','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{EUR,USD}',
   'MiFID II investment firm or tied-agent arrangement; PRIIPs KID required for many ETFs.'),
  ('FR','France','eea','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{EUR,USD}', 'MiFID II passporting review required.'),
  ('IE','Ireland','eea','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{EUR,USD}', 'MiFID II passporting review required.'),
  ('NL','Netherlands','eea','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{EUR,USD}', 'MiFID II passporting review required.'),
  ('ES','Spain','eea','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{EUR,USD}', 'MiFID II passporting review required.'),
  ('IT','Italy','eea','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{EUR,USD}', 'MiFID II passporting review required.'),
  ('NG','Nigeria','africa','sandbox_only',true,true,true,true,'sandbox','{sandbox}','{NGN,USD}',
   'SEC Nigeria registration/approval and CBN foreign-exchange rules for offshore investment need review.'),
  ('CA','Canada','north_america','waitlist',false,false,false,false,NULL,'{}','{}', 'CIRO/provincial review not started.'),
  ('AU','Australia','apac','waitlist',false,false,false,false,NULL,'{}','{}', 'AFSL review not started.'),
  ('SG','Singapore','apac','waitlist',false,false,false,false,NULL,'{}','{}', 'MAS CMS licence review not started.'),
  ('ZA','South Africa','africa','waitlist',false,false,false,false,NULL,'{}','{}', 'FSCA review not started.'),
  ('KE','Kenya','africa','waitlist',false,false,false,false,NULL,'{}','{}', 'CMA review not started.'),
  ('GH','Ghana','africa','waitlist',false,false,false,false,NULL,'{}','{}', 'SEC Ghana review not started.'),
  ('IN','India','apac','blocked',false,false,false,false,NULL,'{}','{}', 'LRS/FEMA constraints; not in scope.'),
  ('CN','China','apac','blocked',false,false,false,false,NULL,'{}','{}', 'Capital controls; not in scope.'),
  ('CU','Cuba','sanctioned','blocked',false,false,false,false,NULL,'{}','{}', 'Comprehensively sanctioned. Never enable.'),
  ('IR','Iran','sanctioned','blocked',false,false,false,false,NULL,'{}','{}', 'Comprehensively sanctioned. Never enable.'),
  ('KP','North Korea','sanctioned','blocked',false,false,false,false,NULL,'{}','{}', 'Comprehensively sanctioned. Never enable.'),
  ('SY','Syria','sanctioned','blocked',false,false,false,false,NULL,'{}','{}', 'Sanctions regime under review; blocked.'),
  ('RU','Russia','sanctioned','blocked',false,false,false,false,NULL,'{}','{}', 'Extensive sanctions. Blocked.'),
  ('BY','Belarus','sanctioned','blocked',false,false,false,false,NULL,'{}','{}', 'Extensive sanctions. Blocked.');

INSERT INTO platform_controls (key, enabled, reason) VALUES
  ('onboarding_enabled', true,  'Initial sandbox configuration'),
  ('trading_enabled',    true,  'Initial sandbox configuration'),
  ('deposits_enabled',   true,  'Initial sandbox configuration'),
  ('withdrawals_enabled',true,  'Initial sandbox configuration');

INSERT INTO launch_gates (key, category, title, description) VALUES
  ('legal_entity',        'legal',      'Legal entity and authorisation', 'Operating entity formed and every required licence, registration or appointed-representative/tied-agent arrangement granted for each live jurisdiction.'),
  ('broker_agreement',    'partners',   'Executed brokerage partner agreement', 'Signed agreement with a licensed broker/custodian covering account opening, custody, execution, clearing and responsibilities split.'),
  ('payments_agreement',  'partners',   'Executed payment provider agreement', 'Signed agreement(s) with regulated payment providers and approved funds-flow / client-money arrangement.'),
  ('kyc_aml_program',     'compliance', 'KYC/AML programme approved', 'Written AML/CTF programme, MLRO/BSA officer appointed, risk assessment, sanctions screening and monitoring rules signed off.'),
  ('disclosures_reviewed','compliance', 'Customer documents reviewed', 'Terms, risk disclosures, fee schedule, privacy notice, complaints procedure and marketing reviewed by counsel per jurisdiction.'),
  ('security_review',     'security',   'Independent security review', 'Penetration test and secure-code review completed with critical/high findings remediated.'),
  ('dr_tested',           'operations', 'Backup restore and DR tested', 'Database restore and disaster-recovery exercise completed within target RPO/RTO.'),
  ('reconciliation_signed_off','operations','Reconciliation sign-off', 'Daily cash/position reconciliation against partner records run cleanly for an agreed parallel period.'),
  ('privacy_dpia',        'privacy',    'Privacy impact assessment', 'DPIA, records of processing, data-transfer mechanisms and retention schedule approved.');

INSERT INTO legal_documents (key, version, title, content_sha256) VALUES
  ('terms_of_service','2026-10-draft','Terms of Service (DRAFT – pending legal review)','draft'),
  ('privacy_policy','2026-10-draft','Privacy Policy (DRAFT – pending legal review)','draft'),
  ('risk_disclosure','2026-10-draft','Investment Risk Disclosure (DRAFT – pending legal review)','draft'),
  ('fee_schedule','2026-10-draft','Fee Schedule (DRAFT – pending legal review)','draft'),
  ('partner_customer_agreement','sandbox','Brokerage Partner Customer Agreement (placeholder – provided by partner)','draft');

-- Platform-level ledger accounts.
INSERT INTO ledger_accounts (type, currency, normal_balance, allow_negative)
SELECT t.type, c.code, t.nb, t.neg FROM currencies c
CROSS JOIN (VALUES ('platform_fee_revenue','credit',false),
                   ('payment_clearing','debit',true),
                   ('broker_settlement','debit',true)) AS t(type, nb, neg);

-- Default sandbox fee schedule (illustrative only).
INSERT INTO fee_schedules (version, status, currency, commission_bps, commission_min_minor, commission_max_minor,
                           fx_spread_bps, deposit_fee_minor, withdrawal_fee_minor, notes, activated_at)
VALUES (1, 'active', 'USD', 10, 0, 1000, 25, 0, 0, 'Sandbox illustrative schedule: 0.10% commission capped at $10.', now());
