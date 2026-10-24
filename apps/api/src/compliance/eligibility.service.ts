import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../database/db.service';
import { AppError } from '../common/errors';
import { ControlKey, ControlsService } from './controls.service';

export type Capability = 'onboarding' | 'trading' | 'deposits' | 'withdrawals';

export interface JurisdictionRow {
  code: string;
  name: string;
  region: string;
  status: 'blocked' | 'waitlist' | 'sandbox_only' | 'live';
  onboarding_enabled: boolean;
  trading_enabled: boolean;
  deposits_enabled: boolean;
  withdrawals_enabled: boolean;
  broker_provider: string | null;
  payment_providers: string[];
  allowed_currencies: string[];
  min_age: number;
  requires_tax_id: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  jurisdiction: string | null;
  reasons: string[];
  requiresManualReview: boolean;
  manualReviewReasons: string[];
}

const RESTRICTION_BLOCKS: Record<Capability, string[]> = {
  onboarding: ['full_freeze'],
  trading: ['full_freeze', 'trading_block'],
  deposits: ['full_freeze', 'deposit_block', 'close_only'],
  withdrawals: ['full_freeze', 'withdrawal_block'],
};

export function ageOn(dob: Date, at = new Date()): number {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Jurisdiction status permits the capability in the current operating mode. */
export function jurisdictionAllows(j: JurisdictionRow, cap: Capability, mode: 'sandbox' | 'live'): boolean {
  if (j.status === 'blocked' || j.status === 'waitlist') return false;
  if (mode === 'live' && j.status !== 'live') return false;
  return j[`${cap}_enabled`];
}

@Injectable()
export class EligibilityService {
  constructor(private readonly db: DbService, private readonly controls: ControlsService) {}

  async jurisdiction(code: string | null | undefined): Promise<JurisdictionRow | undefined> {
    if (!code) return undefined;
    return this.db.one<JurisdictionRow>('SELECT * FROM jurisdictions WHERE code = $1', [code]);
  }

  /** Pure eligibility evaluation for an onboarding application. */
  evaluate(input: {
    residence?: JurisdictionRow;
    nationality?: JurisdictionRow;
    dateOfBirth?: Date | null;
    taxIdProvided: boolean;
    isPep?: boolean | null;
    mode: 'sandbox' | 'live';
  }): EligibilityResult {
    const reasons: string[] = [];
    const manual: string[] = [];
    const j = input.residence;
    if (!j) reasons.push('Country of residence is required');
    else if (!jurisdictionAllows(j, 'onboarding', input.mode)) {
      reasons.push(
        j.status === 'waitlist'
          ? `We are not yet able to serve residents of ${j.name}. You have been added to the waitlist.`
          : `We cannot open accounts for residents of ${j.name}.`,
      );
    }
    if (!input.dateOfBirth) reasons.push('Date of birth is required');
    else if (j && ageOn(input.dateOfBirth) < j.min_age) reasons.push(`You must be at least ${j.min_age} to open an account`);
    if (j?.requires_tax_id && !input.taxIdProvided) reasons.push('A tax identification number is required in your country');
    if (input.nationality?.region === 'sanctioned') manual.push('Nationality associated with a sanctioned jurisdiction');
    if (input.isPep) manual.push('Politically exposed person declaration');
    return {
      eligible: reasons.length === 0,
      jurisdiction: j?.code ?? null,
      reasons,
      requiresManualReview: manual.length > 0,
      manualReviewReasons: manual,
    };
  }

  /**
   * Single choke point for "may this customer do X right now?" Used by onboarding, orders and payments.
   * Throws a descriptive AppError when not permitted.
   */
  async assertCapability(userId: string, cap: Capability, mode: 'sandbox' | 'live', q: Queryable = this.db.pool): Promise<void> {
    await this.controls.assertEnabled(`${cap}_enabled` as ControlKey);
    const u = (
      await q.query<{ status: string; residence_country: string | null; app_status: string | null }>(
        `SELECT u.status, COALESCE(p.residence_country, u.residence_country) AS residence_country, a.status AS app_status
           FROM users u
           LEFT JOIN customer_profiles p ON p.user_id = u.id
           LEFT JOIN onboarding_applications a ON a.user_id = u.id
          WHERE u.id = $1`,
        [userId],
      )
    ).rows[0];
    if (!u || u.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'Account is not active', 403);
    const j = await this.jurisdiction(u.residence_country);
    if (!j || !jurisdictionAllows(j, cap, mode)) {
      throw new AppError('JURISDICTION_NOT_SUPPORTED', `This service is not available in your country of residence`, 403);
    }
    if (cap !== 'onboarding' && u.app_status !== 'approved') {
      throw new AppError('ONBOARDING_INCOMPLETE', 'Your account application has not been approved yet', 403);
    }
    const blocking = await q.query<{ type: string }>(
      'SELECT type FROM account_restrictions WHERE user_id = $1 AND lifted_at IS NULL AND type = ANY($2)',
      [userId, RESTRICTION_BLOCKS[cap]],
    );
    if (blocking.rows.length) {
      throw new AppError('ACCOUNT_RESTRICTED', 'Your account is restricted for this action. Please contact support.', 403, {
        restrictions: blocking.rows.map((r) => r.type),
      });
    }
  }
}
