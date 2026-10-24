/**
 * Identity verification (KYC) and sanctions/PEP screening boundaries.
 * Candidate providers (verify coverage per country, esp. Nigeria NIN/BVN): Onfido, Sumsub, Persona,
 * Veriff, Smile ID (Africa); screening: ComplyAdvantage, Refinitiv World-Check, Dow Jones, LexisNexis.
 * Some brokerage partners (e.g. Alpaca) also run their own KYC on account submission; responsibilities
 * must be allocated in the partner agreement.
 */
export interface KycApplicant {
  userId: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
  residence: string;
  address: string;
}

export interface KycResult {
  reference: string;
  status: 'pending' | 'clear' | 'consider' | 'rejected' | 'error';
  reasons: string[];
}

export interface ScreeningResult {
  status: 'clear' | 'potential_match' | 'error';
  listVersion: string;
  matches: Array<{ name: string; list: string; score: number }>;
}

export interface KycAdapter {
  readonly name: string;
  verify(applicant: KycApplicant): Promise<KycResult>;
}

export interface ScreeningAdapter {
  readonly name: string;
  screen(person: { fullName: string; dateOfBirth: string; nationality: string }): Promise<ScreeningResult>;
}

export const KYC_ADAPTER = Symbol('KYC_ADAPTER');
export const SCREENING_ADAPTER = Symbol('SCREENING_ADAPTER');

/** SANDBOX KYC: family name "Reject" → rejected, "Review" → consider, otherwise clear. */
export class SandboxKycAdapter implements KycAdapter {
  readonly name = 'sandbox-kyc';
  async verify(a: KycApplicant): Promise<KycResult> {
    const ref = `sbx-kyc-${a.userId}`;
    if (/^reject/i.test(a.familyName)) return { reference: ref, status: 'rejected', reasons: ['Document could not be verified (sandbox)'] };
    if (/^review/i.test(a.familyName)) return { reference: ref, status: 'consider', reasons: ['Address mismatch requires review (sandbox)'] };
    return { reference: ref, status: 'clear', reasons: [] };
  }
}

/** SANDBOX screening against a fictional test list. Real screening must use maintained official lists. */
export class SandboxScreeningAdapter implements ScreeningAdapter {
  readonly name = 'sandbox-screening';
  static readonly TEST_LIST = ['sanction testperson', 'pep testperson'];
  async screen(p: { fullName: string }): Promise<ScreeningResult> {
    const name = p.fullName.trim().toLowerCase();
    const hit = SandboxScreeningAdapter.TEST_LIST.find((n) => n === name);
    return {
      status: hit ? 'potential_match' : 'clear',
      listVersion: 'sandbox-test-list-1',
      matches: hit ? [{ name: hit, list: 'SANDBOX-FICTIONAL', score: 1 }] : [],
    };
  }
}
