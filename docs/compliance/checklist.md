# Compliance checklist — for professional review

> **This is not legal advice and makes no legal conclusions.** It lists questions and workstreams that
> qualified, jurisdiction-specific counsel and compliance professionals must resolve. Named rules are
> pointers for that review; confirm currency and applicability with counsel. One licence or partner
> does not permit worldwide operation; each country is enabled individually in the admin console only
> after its review is recorded (`jurisdictions.legal_review_ref`).

## How the platform enforces this checklist

- Every country starts `blocked`; `sandbox_only` countries can never operate in live mode; `live` requires
  a legal review reference (DB constraint). Sanctioned regions cannot be enabled from the console.
- Each capability (onboarding, trading, deposits, withdrawals) is switched per country and globally.
- Live mode refuses to start until all launch gates (legal entity, partner agreements, AML programme,
  disclosures, security review, DR test, reconciliation sign-off, DPIA) have two approvals with evidence.
- Instruments can be restricted per jurisdiction (US ETFs are blocked for EEA residents by default
  pending PRIIPs review).

## Cross-cutting workstreams

| Area | Questions to resolve | Owner |
|---|---|---|
| Legal entity & permissions | Which entity contracts with customers in each country? Is the platform acting as a broker, introducer, appointed representative/tied agent, or pure technology provider? Do any activities (e.g. "arranging deals", handling orders, marketing) require authorisation even if the partner executes? | Counsel |
| Partner responsibilities | Allocation of KYC/AML, suitability/appropriateness, best execution, client money/assets, statements, tax reporting, complaints, record keeping, SAR/STR filing, marketing approval | Counsel + partner |
| KYC/AML | Written AML/CTF programme, risk assessment, CIP/CDD/EDD procedures, PEP handling, ongoing monitoring rules and thresholds (current rules are placeholders), MLRO/BSA officer appointment, training, independent testing | MLRO |
| Sanctions | Lists screened (OFAC, UN, UK HMT/OFSI, EU consolidated, Nigeria), screening frequency (onboarding + ongoing re-screening), IP/geo controls, escalation and freezing procedure | MLRO |
| Privacy & data transfer | Lawful bases, DPIA, records of processing, retention schedule, international transfer mechanisms (SCCs/IDTA/adequacy), DPO, vendor DPAs, data subject request process | DPO / counsel |
| Customer disclosures | Terms, partner customer agreement, risk warnings, fee & costs disclosures (incl. ex-ante/ex-post where required), order execution summary, conflicts of interest, complaints procedure — all currently **drafts** | Counsel |
| Client money / assets | Where customer cash sits at each stage (payment provider → partner), segregation, reconciliation obligations, failure scenarios | Counsel + finance |
| Investor protection | Which compensation scheme (if any) covers customers in each country via the partner | Counsel |
| Tax | W-8BEN/W-9 collection for US securities, withholding on dividends, reporting (1099/1042-S, CRS/FATCA), local tax reporting | Tax advisor + partner |
| Record retention | Required retention periods per record type and jurisdiction; WORM storage requirements | Compliance |
| Marketing | Financial promotion approval regimes, social media/influencer rules, cross-border solicitation restrictions, required risk warnings | Counsel |
| Complaints | Deadlines, ombudsman/ADR referral rights, MI reporting (system defaults to an 8-week final-response clock) | Compliance |
| Operational resilience & outsourcing | Outsourcing notifications, cloud/vendor due diligence, BCP/DR, incident reporting obligations | Compliance + engineering |

## United States

| Item | Pointers for review |
|---|---|
| Authorisation | Broker-dealer registration with the SEC and FINRA membership, or operating strictly as a non-broker technology/referral provider to a registered BD (finder/solicitation and compensation limits); state securities registration; possible investment-adviser rules if any recommendations/model portfolios |
| Partner | Introducing/clearing arrangement with a FINRA-member, SIPC-member broker-dealer; Form/contract allocation of responsibilities |
| KYC/AML | Bank Secrecy Act AML programme (FINRA Rule 3310), Customer Identification Program (31 CFR 1023.220), CDD/beneficial ownership, SAR filing, OFAC compliance |
| Conduct | Reg BI (if recommendations), FINRA Rule 2210 communications, best execution, order routing disclosures (Rule 606) — largely partner obligations to confirm |
| Records | SEC Rules 17a-3/17a-4 (books & records, WORM/third-party access requirements) if the platform is in scope |
| Privacy | Reg S-P, GLBA, state privacy laws (e.g. CCPA/CPRA) |
| Protection | SIPC coverage via the carrying broker; explain limits clearly |
| Tax | W-9 for US persons, 1099 reporting via the partner |

## United Kingdom

| Item | Pointers for review |
|---|---|
| Authorisation | FCA Part 4A permission (e.g. arranging deals in investments, dealing as agent) or appointed-representative arrangement with an authorised principal; FCA change-in-control and SM&CR implications |
| Financial promotions | FSMA s21 — promotions must be made or approved by an authorised person (with the approver regime in force since 2024) |
| Consumer protection | Consumer Duty (outcomes, fair value, communications), appropriateness assessment for complex products, cost & charges disclosure |
| Client assets | CASS (client money and custody) — likely partner obligations; confirm |
| AML & sanctions | Money Laundering Regulations 2017 (as amended), POCA 2002, OFSI financial sanctions |
| Product rules | Retail disclosure regime for packaged products (PRIIPs/UK CCI replacement) — affects ETF availability |
| Complaints | DISP, Financial Ombudsman Service referral rights |
| Protection | FSCS coverage via the partner, if applicable |
| Privacy | UK GDPR, Data Protection Act 2018, ICO registration |
| Reporting | MiFIR transaction reporting (partner), tax reporting incl. CRS |

## European Union / EEA

| Item | Pointers for review |
|---|---|
| Authorisation | MiFID II investment-firm authorisation by a national competent authority with passporting, or tied-agent registration under an authorised firm; cross-border marketing rules per member state |
| Product rules | PRIIPs KID requirement for packaged products (many US-domiciled ETFs lack a KID → retail restriction); MiFID II product governance and appropriateness |
| Disclosures | MiFID II costs & charges (ex-ante/ex-post), best execution, conflicts, record keeping incl. communications |
| AML | EU AML directives as transposed nationally; incoming EU AML Regulation and AMLA supervision; sanctions under EU regulations |
| Investor compensation | Investor Compensation Schemes Directive coverage via the partner |
| Privacy | GDPR, international transfers (US providers: adequacy/DPF or SCCs), DPIA |
| Operational | DORA (ICT risk, incident reporting, third-party register) for in-scope financial entities |
| Tax | DAC/CRS reporting, withholding relief forms |

## Nigeria

| Item | Pointers for review |
|---|---|
| Authorisation | SEC Nigeria registration of the appropriate capital-market operator category under the Investments and Securities Act (confirm the current Act and rules), and SEC's position on platforms offering foreign securities to Nigerian residents |
| Foreign exchange | Central Bank of Nigeria rules on FX for offshore portfolio investment (eligible windows, documentation, limits); funding rails in NGN vs USD; repatriation |
| AML/CFT | Money Laundering (Prevention and Prohibition) Act, Terrorism (Prevention and Prohibition) Act, SEC AML/CFT regulations, NFIU reporting (STR/CTR), BVN/NIN-based identity verification |
| Privacy | Nigeria Data Protection Act 2023 and NDPC regulations; cross-border transfer rules; registration as data controller of major importance where applicable |
| Consumer protection | FCCPC requirements, SEC complaint handling, disclosure in plain language |
| Tax | FIRS obligations, withholding on foreign dividends, customer tax reporting |
| Partner | Confirm the brokerage partner will onboard Nigerian residents and the licensing position of any local intermediary |

## Pre-launch evidence pack (maps to launch gates)

1. Licences/registrations or AR/tied-agent agreements per enabled country (`legal_entity`).
2. Signed brokerage partner agreement with responsibilities matrix (`broker_agreement`).
3. Signed payment provider agreements and approved funds-flow/client-money diagram (`payments_agreement`).
4. Board-approved AML/CTF programme, risk assessment, monitoring thresholds, MLRO appointment (`kyc_aml_program`).
5. Counsel-approved customer documents per country, replacing every draft in `apps/web/app/legal/content.ts` and `legal_documents` (`disclosures_reviewed`).
6. Pen test report with criticals/highs closed (`security_review`).
7. Restore/DR test report meeting RPO/RTO (`dr_tested`).
8. Parallel-run reconciliation sign-off with the partner (`reconciliation_signed_off`).
9. DPIA, RoPA, transfer assessments, retention schedule (`privacy_dpia`).
