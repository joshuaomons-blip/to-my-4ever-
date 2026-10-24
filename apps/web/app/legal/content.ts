/**
 * DRAFT legal content. Every document is a placeholder that MUST be replaced by text prepared or
 * approved by qualified counsel for each jurisdiction, and (for the partner agreement) supplied by
 * the licensed brokerage partner. Nothing here is legal advice or a statement of authorisation.
 */
export const LEGAL: Record<string, { title: string; sections: Array<[string, string]> }> = {
  terms_of_service: {
    title: 'Terms of Service',
    sections: [
      ['Status of this document', 'This is a draft placeholder pending legal review. It is not in force.'],
      ['Who we are', 'Aureon Capital (placeholder name) operates a technology platform. Brokerage, custody, execution and clearing services are provided by a licensed brokerage partner under a separate customer agreement between you and that partner.'],
      ['Eligibility', 'Services are available only to individuals aged 18 or over who reside in a jurisdiction we support and who pass identity verification and sanctions screening.'],
      ['Your account', 'Your securities and cash are held by our partner in your name or for your benefit in accordance with applicable client-asset rules. We do not hold your securities.'],
      ['Orders', 'Orders you submit are routed to our partner for execution. We do not guarantee execution, price or timing. The partner\'s execution records are authoritative.'],
      ['Fees', 'Fees are set out in the Fee Schedule. We will give notice of changes as required by law.'],
      ['Termination', 'Either party may close the account subject to the partner agreement and applicable law.'],
    ],
  },
  privacy_policy: {
    title: 'Privacy Policy',
    sections: [
      ['Status of this document', 'Draft placeholder pending privacy counsel review (GDPR/UK GDPR, NDPA 2023, US state laws).'],
      ['Data we collect', 'Identity, contact, financial profile, device and usage data, and transaction records required to provide services and meet legal obligations.'],
      ['Why we use it', 'To open and operate your account, verify identity, prevent fraud and financial crime, meet regulatory record-keeping, and communicate with you.'],
      ['Sharing', 'With our brokerage partner, payment providers, identity-verification and screening providers, and regulators or authorities where required by law.'],
      ['International transfers', 'Where data is transferred internationally we use appropriate safeguards (e.g. standard contractual clauses). Details to be confirmed.'],
      ['Retention', 'Financial and identity records are retained for the periods required by law (typically at least 5–7 years after the relationship ends).'],
      ['Your rights', 'Depending on your location you may have rights of access, correction, deletion (subject to legal retention), restriction and objection.'],
    ],
  },
  risk_disclosure: {
    title: 'Investment Risk Disclosure',
    sections: [
      ['Status of this document', 'Draft placeholder pending legal review.'],
      ['Capital at risk', 'The value of investments can go down as well as up, and you may get back less than you invest.'],
      ['No advice', 'We do not provide investment, tax or legal advice. Information on the platform is not a recommendation.'],
      ['Market risks', 'Prices can move rapidly. Market orders may execute at prices different from those displayed. Market data may be delayed or interrupted.'],
      ['Currency risk', 'US securities are priced in USD. If your home currency differs, exchange-rate movements affect your returns.'],
      ['Fractional shares', 'Fractional shares may have limited transferability and different corporate-action treatment.'],
      ['Investor protection', 'Coverage under investor-compensation schemes depends on the partner\'s jurisdiction and status and may not cover market losses.'],
    ],
  },
  fee_schedule: {
    title: 'Fee Schedule',
    sections: [
      ['Status of this document', 'Draft placeholder. Current illustrative sandbox fees are published live at /v1/public/fees.'],
      ['Commission', 'A percentage of order value, subject to a minimum and maximum per order, charged on execution.'],
      ['Currency conversion', 'Not yet available. When enabled, a disclosed spread will apply.'],
      ['Third-party fees', 'Regulatory, exchange or partner fees may apply and will be shown where applicable.'],
    ],
  },
  complaints: {
    title: 'Complaints Procedure',
    sections: [
      ['Status of this document', 'Draft placeholder; must be aligned with each jurisdiction\'s rules (e.g. FCA DISP, SEC Nigeria, EU national ADR).'],
      ['How to complain', 'Open a support request and choose "Make a complaint", or write to our complaints team (address to be confirmed).'],
      ['What happens next', 'We acknowledge promptly, investigate fairly, and aim to send a final response within 8 weeks.'],
      ['Escalation', 'If you are not satisfied you may be able to refer your complaint to the relevant ombudsman or regulator in your country.'],
    ],
  },
  partner_customer_agreement: {
    title: 'Brokerage Partner Customer Agreement',
    sections: [['Placeholder', 'This agreement is provided by the licensed brokerage partner once selected. In the sandbox no agreement is formed.']],
  },
};
