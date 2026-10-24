import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuditService } from '../common/audit.service';
import { encryptField } from '../common/crypto';
import { AppError } from '../common/errors';
import { AppRequest } from '../common/request-context';
import { ControlsService } from '../compliance/controls.service';
import { EligibilityService } from '../compliance/eligibility.service';
import { DbService } from '../database/db.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationService } from '../notifications/mailer.service';
import { KYC_ADAPTER, KycAdapter, SCREENING_ADAPTER, ScreeningAdapter } from './kyc.adapter';
import { ProfileDto } from './onboarding.dto';

export const REQUIRED_DOCUMENTS = ['terms_of_service', 'privacy_policy', 'risk_disclosure', 'fee_schedule', 'partner_customer_agreement'];

const REQUIRED_PROFILE_FIELDS = ['legal_first_name', 'legal_last_name', 'date_of_birth', 'nationality', 'residence_country', 'address_line1', 'city', 'postal_code', 'phone', 'employment_status', 'investment_experience', 'risk_tolerance', 'funding_source'];

@Injectable()
export class OnboardingService {
  constructor(
    private readonly db: DbService,
    private readonly eligibility: EligibilityService,
    private readonly controls: ControlsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    @Inject(KYC_ADAPTER) private readonly kyc: KycAdapter,
    @Inject(SCREENING_ADAPTER) private readonly screening: ScreeningAdapter,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private async ensureApplication(userId: string) {
    await this.db.query('INSERT INTO onboarding_applications (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    return (await this.db.one<{ id: string; status: string; decision_reason: string | null; eligibility_snapshot: unknown; submitted_at: Date | null }>(
      'SELECT id, status, decision_reason, eligibility_snapshot, submitted_at FROM onboarding_applications WHERE user_id = $1',
      [userId],
    ))!;
  }

  async requiredDocuments() {
    return this.db.query<{ key: string; version: string; title: string }>(
      `SELECT DISTINCT ON (key) key, version, title FROM legal_documents WHERE key = ANY($1) ORDER BY key, published_at DESC`,
      [REQUIRED_DOCUMENTS],
    );
  }

  async status(userId: string) {
    const app = await this.ensureApplication(userId);
    const profile = await this.db.one<Record<string, unknown>>('SELECT * FROM customer_profiles WHERE user_id = $1', [userId]);
    const user = await this.db.one<{ mfa_enabled: boolean; email_verified_at: Date | null }>('SELECT mfa_enabled, email_verified_at FROM users WHERE id = $1', [userId]);
    const docs = await this.requiredDocuments();
    const accepted = await this.db.query<{ document_key: string; document_version: string }>(
      'SELECT document_key, document_version FROM disclosure_acceptances WHERE user_id = $1',
      [userId],
    );
    const acceptedSet = new Set(accepted.map((a) => `${a.document_key}@${a.document_version}`));
    const missingProfile = REQUIRED_PROFILE_FIELDS.filter((f) => !profile?.[f]);
    const brokerage = await this.db.one<{ status: string; account_number: string | null }>('SELECT status, account_number FROM brokerage_accounts WHERE user_id = $1', [userId]);
    return {
      applicationId: app.id,
      status: app.status,
      decisionReason: app.status === 'rejected' || app.status === 'ineligible' ? app.decision_reason : null,
      steps: {
        emailVerified: !!user?.email_verified_at,
        mfaEnabled: !!user?.mfa_enabled,
        profileComplete: missingProfile.length === 0,
        disclosuresAccepted: docs.every((d) => acceptedSet.has(`${d.key}@${d.version}`)),
        submitted: !!app.submitted_at,
      },
      missingProfileFields: missingProfile,
      documents: docs.map((d) => ({ ...d, accepted: acceptedSet.has(`${d.key}@${d.version}`) })),
      profile: profile ? this.presentProfile(profile) : null,
      brokerageAccount: brokerage ? { status: brokerage.status, accountNumber: brokerage.account_number } : null,
      eligibility: app.eligibility_snapshot,
    };
  }

  private presentProfile(p: Record<string, unknown>) {
    return {
      legalFirstName: p.legal_first_name, legalLastName: p.legal_last_name,
      dateOfBirth: p.date_of_birth instanceof Date ? p.date_of_birth.toISOString().slice(0, 10) : p.date_of_birth,
      nationality: p.nationality, residenceCountry: p.residence_country, addressLine1: p.address_line1, addressLine2: p.address_line2,
      city: p.city, region: p.region, postalCode: p.postal_code, phone: p.phone,
      taxIdLast4: p.tax_id_last4, employmentStatus: p.employment_status, annualIncomeBand: p.annual_income_band,
      netWorthBand: p.net_worth_band, investmentExperience: p.investment_experience, riskTolerance: p.risk_tolerance,
      fundingSource: p.funding_source, isPoliticallyExposed: p.is_politically_exposed, isControlPerson: p.is_control_person,
      isAffiliatedExchange: p.is_affiliated_exchange,
    };
  }

  async saveProfile(userId: string, dto: ProfileDto, req: AppRequest) {
    const app = await this.ensureApplication(userId);
    if (app.status !== 'draft') throw new AppError('APPLICATION_LOCKED', 'Your application has been submitted and can no longer be edited. Contact support to change details.', 409);
    const dob = new Date(`${dto.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime()) || dob > new Date() || dob.getUTCFullYear() < 1900) throw new AppError('INVALID_DATE_OF_BIRTH', 'Invalid date of birth', 400);
    for (const code of [dto.nationality, dto.residenceCountry]) {
      if (!(await this.eligibility.jurisdiction(code))) throw new AppError('UNKNOWN_COUNTRY', `Unsupported country code ${code}`, 400);
    }
    const taxEnc = dto.taxId ? encryptField(this.cfg.encryptionKey, dto.taxId, `tax:${userId}`) : null;
    await this.db.tx(async (c) => {
      await c.query(
        `INSERT INTO customer_profiles (user_id, legal_first_name, legal_last_name, date_of_birth, nationality, residence_country, address_line1,
           address_line2, city, region, postal_code, phone, tax_id_enc, tax_id_last4, employment_status, annual_income_band, net_worth_band,
           investment_experience, risk_tolerance, funding_source, is_politically_exposed, is_control_person, is_affiliated_exchange)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (user_id) DO UPDATE SET legal_first_name=$2, legal_last_name=$3, date_of_birth=$4, nationality=$5, residence_country=$6,
           address_line1=$7, address_line2=$8, city=$9, region=$10, postal_code=$11, phone=$12,
           tax_id_enc=COALESCE($13, customer_profiles.tax_id_enc), tax_id_last4=COALESCE($14, customer_profiles.tax_id_last4),
           employment_status=$15, annual_income_band=$16, net_worth_band=$17, investment_experience=$18, risk_tolerance=$19,
           funding_source=$20, is_politically_exposed=$21, is_control_person=$22, is_affiliated_exchange=$23`,
        [userId, dto.legalFirstName.trim(), dto.legalLastName.trim(), dto.dateOfBirth, dto.nationality, dto.residenceCountry, dto.addressLine1,
          dto.addressLine2 ?? null, dto.city, dto.region ?? null, dto.postalCode, dto.phone, taxEnc, dto.taxId ? dto.taxId.slice(-4) : null,
          dto.employmentStatus, dto.annualIncomeBand, dto.netWorthBand, dto.investmentExperience, dto.riskTolerance, dto.fundingSource,
          dto.isPoliticallyExposed, dto.isControlPerson, dto.isAffiliatedExchange],
      );
      await c.query('UPDATE users SET residence_country = $2 WHERE id = $1', [userId, dto.residenceCountry]);
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'onboarding.profile_saved', targetType: 'user', targetId: userId, req }, c);
    });
    // Early, non-binding eligibility feedback.
    const [residence, nationality] = await Promise.all([this.eligibility.jurisdiction(dto.residenceCountry), this.eligibility.jurisdiction(dto.nationality)]);
    return this.eligibility.evaluate({ residence, nationality, dateOfBirth: dob, taxIdProvided: !!dto.taxId || !!taxEnc, isPep: dto.isPoliticallyExposed, mode: this.cfg.operatingMode });
  }

  async acceptDisclosures(userId: string, docs: Array<{ key: string; version: string }>, req: AppRequest) {
    for (const d of docs) {
      await this.db.query(
        `INSERT INTO disclosure_acceptances (user_id, document_key, document_version, ip, user_agent) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, document_key, document_version) DO NOTHING`,
        [userId, d.key, d.version, req.ip ?? null, req.header('user-agent')?.slice(0, 400) ?? null],
      ).catch((e: { code?: string }) => {
        if (e.code === '23503') throw new AppError('UNKNOWN_DOCUMENT', `Unknown document ${d.key}@${d.version}`, 400);
        throw e;
      });
    }
    await this.audit.record({ actorType: 'customer', actorId: userId, action: 'onboarding.disclosures_accepted', metadata: { documents: docs }, req });
    return this.status(userId);
  }

  async submit(userId: string, req: AppRequest) {
    // Jurisdiction eligibility is evaluated below (recorded as 'ineligible' rather than thrown).
    await this.controls.assertEnabled('onboarding_enabled');
    const s = await this.status(userId);
    if (s.status !== 'draft') throw new AppError('ALREADY_SUBMITTED', 'Application already submitted', 409);
    if (!s.steps.mfaEnabled) throw new AppError('MFA_REQUIRED_FOR_ONBOARDING', 'Enable two-factor authentication before submitting', 422);
    if (!s.steps.profileComplete) throw new AppError('PROFILE_INCOMPLETE', 'Complete your profile first', 422, { missing: s.missingProfileFields });
    if (!s.steps.disclosuresAccepted) throw new AppError('DISCLOSURES_REQUIRED', 'Please review and accept all required documents', 422);

    const p = (await this.db.one<{ residence_country: string; nationality: string; date_of_birth: Date; tax_id_enc: string | null; is_politically_exposed: boolean }>(
      'SELECT residence_country, nationality, date_of_birth, tax_id_enc, is_politically_exposed FROM customer_profiles WHERE user_id = $1',
      [userId],
    ))!;
    const [residence, nationality] = await Promise.all([this.eligibility.jurisdiction(p.residence_country), this.eligibility.jurisdiction(p.nationality)]);
    const result = this.eligibility.evaluate({ residence, nationality, dateOfBirth: p.date_of_birth, taxIdProvided: !!p.tax_id_enc, isPep: p.is_politically_exposed, mode: this.cfg.operatingMode });
    await this.db.tx(async (c) => {
      if (!result.eligible) {
        await c.query(
          `UPDATE onboarding_applications SET status = 'ineligible', submitted_at = now(), eligibility_snapshot = $2, decided_at = now(),
                  decision_source = 'automatic', decision_reason = $3 WHERE user_id = $1`,
          [userId, JSON.stringify(result), result.reasons.join(' ')],
        );
      } else {
        await c.query(
          "UPDATE onboarding_applications SET status = 'kyc_pending', submitted_at = now(), eligibility_snapshot = $2 WHERE user_id = $1",
          [userId, JSON.stringify(result)],
        );
        await this.jobs.enqueue(c, 'onboarding.verify', { userId }, { dedupeKey: `kyc:${userId}` });
      }
      await this.audit.record({ actorType: 'customer', actorId: userId, action: 'onboarding.submitted', metadata: { eligible: result.eligible }, req }, c);
    });
    return this.status(userId);
  }

  /** Job: run KYC + sanctions/PEP screening and decide (auto-approve only when everything is clear). */
  async verify(userId: string): Promise<void> {
    const app = await this.db.one<{ id: string; status: string; eligibility_snapshot: { requiresManualReview?: boolean; manualReviewReasons?: string[] } }>(
      'SELECT id, status, eligibility_snapshot FROM onboarding_applications WHERE user_id = $1',
      [userId],
    );
    if (!app || app.status !== 'kyc_pending') return;
    const p = (await this.db.one<Record<string, string | Date>>('SELECT * FROM customer_profiles WHERE user_id = $1', [userId]))!;
    const dob = (p.date_of_birth as Date).toISOString().slice(0, 10);
    const fullName = `${p.legal_first_name} ${p.legal_last_name}`;
    const [kyc, screen] = await Promise.all([
      this.kyc.verify({
        userId, givenName: String(p.legal_first_name), familyName: String(p.legal_last_name), dateOfBirth: dob,
        nationality: String(p.nationality), residence: String(p.residence_country), address: `${p.address_line1}, ${p.city}, ${p.postal_code}`,
      }),
      this.screening.screen({ fullName, dateOfBirth: dob, nationality: String(p.nationality) }),
    ]);
    if (kyc.status === 'error' || screen.status === 'error') throw new Error('KYC/screening provider error; will retry');
    await this.db.tx(async (c) => {
      await c.query(
        `INSERT INTO kyc_checks (application_id, provider, provider_reference, status, result) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (provider, provider_reference) DO UPDATE SET status = EXCLUDED.status, result = EXCLUDED.result`,
        [app.id, this.kyc.name, kyc.reference, kyc.status, JSON.stringify(kyc)],
      );
      await c.query('INSERT INTO screening_results (user_id, provider, list_version, status, matches) VALUES ($1,$2,$3,$4,$5)', [
        userId, this.screening.name, screen.listVersion, screen.status, JSON.stringify(screen.matches),
      ]);
      const manual = [...(app.eligibility_snapshot?.manualReviewReasons ?? [])];
      if (kyc.status === 'consider') manual.push(...kyc.reasons);
      if (screen.status === 'potential_match') manual.push('Potential sanctions/PEP screening match');
      if (kyc.status === 'rejected') {
        await c.query(
          "UPDATE onboarding_applications SET status = 'rejected', decided_at = now(), decision_source = 'automatic', decision_reason = $2 WHERE id = $1",
          [app.id, 'Identity verification was unsuccessful'],
        );
        await this.notifications.notify(userId, 'onboarding', 'Application update', 'We were unable to verify your identity. Contact support if you believe this is an error.', {}, c);
      } else if (manual.length) {
        await c.query("UPDATE onboarding_applications SET status = 'manual_review', decision_reason = $2 WHERE id = $1", [app.id, manual.join('; ')]);
      } else {
        await c.query("UPDATE onboarding_applications SET status = 'approved', decided_at = now(), decision_source = 'automatic' WHERE id = $1", [app.id]);
        await this.jobs.enqueue(c, 'brokerage.open_account', { userId }, { dedupeKey: `open:${userId}` });
      }
      await this.audit.record({ actorType: 'system', action: 'onboarding.verified', targetType: 'onboarding_application', targetId: app.id, metadata: { kyc: kyc.status, screening: screen.status, manual } }, c);
    });
  }

  /** Staff decision for applications in manual review. */
  async decide(staffId: string, applicationId: string, decision: 'approve' | 'reject', reason: string, req: AppRequest) {
    await this.db.tx(async (c) => {
      const app = (await c.query<{ id: string; user_id: string; status: string }>('SELECT id, user_id, status FROM onboarding_applications WHERE id = $1 FOR UPDATE', [applicationId])).rows[0];
      if (!app) throw new AppError('NOT_FOUND', 'Application not found', 404);
      if (app.status !== 'manual_review') throw new AppError('INVALID_STATE', `Application is ${app.status}`, 409);
      if (decision === 'approve') {
        const open = (await c.query("SELECT 1 FROM screening_results WHERE user_id = $1 AND status = 'potential_match' AND reviewed_at IS NULL", [app.user_id])).rows;
        if (open.length) throw new AppError('SCREENING_UNRESOLVED', 'Resolve screening matches before approving', 409);
      }
      await c.query(
        `UPDATE onboarding_applications SET status = $2, decided_at = now(), decided_by = $3, decision_source = 'staff', decision_reason = $4 WHERE id = $1`,
        [applicationId, decision === 'approve' ? 'approved' : 'rejected', staffId, reason],
      );
      if (decision === 'approve') await this.jobs.enqueue(c, 'brokerage.open_account', { userId: app.user_id }, { dedupeKey: `open:${app.user_id}` });
      await this.notifications.notify(app.user_id, 'onboarding', decision === 'approve' ? 'Application approved' : 'Application update',
        decision === 'approve' ? 'Your application was approved. We are opening your brokerage account.' : 'We are unable to open an account for you at this time.', {}, c);
      await this.audit.record({ actorType: 'staff', actorId: staffId, action: `onboarding.${decision}d`, targetType: 'onboarding_application', targetId: applicationId, metadata: { reason }, req }, c);
    });
  }
}
