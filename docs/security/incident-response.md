# Incident response

## Severity

| Sev | Examples | Response |
|---|---|---|
| 1 | Unauthorised money movement, data breach, ledger integrity failure, partner reports unknown trades | Immediate; incident commander; consider kill switches; regulator/partner notification assessment |
| 2 | Platform-wide outage, partner outage, reconciliation breaks affecting many customers | < 30 min |
| 3 | Partial degradation, single-customer issues | Business hours |

## Procedure

1. **Detect & declare** — alert, customer report, partner notice. Open an incident channel and log.
2. **Contain** — use admin kill switches (`trading`, `deposits`, `withdrawals`, `onboarding`); freeze
   affected accounts (`full_freeze`); revoke sessions; rotate exposed credentials (partner keys,
   webhook secrets, DB passwords, encryption key per runbook); block abusive IPs at the WAF.
3. **Preserve evidence** — export audit log (verify hash chain), application logs, DB snapshot
   (do not modify financial tables; corrections later via reversing entries).
4. **Assess** — scope of customers/funds/data; reconcile against partner and payment provider records.
5. **Notify** — brokerage partner (contractual), payment providers, and — as counsel advises —
   regulators and data-protection authorities within statutory deadlines (e.g. 72h under GDPR/UK GDPR
   for personal-data breaches where required), and affected customers.
6. **Recover** — fix, verify with tests and reconciliation, re-enable controls with reasons recorded.
7. **Review** — blameless post-incident review within 5 business days; track actions.

Contacts (to fill in): incident commander rota, MLRO/BSA officer, DPO, counsel, partner incident
desk, payment provider incident desk, cloud support.
