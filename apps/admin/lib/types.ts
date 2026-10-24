export interface Me { id: string; email: string; display_name: string; mfa_enabled: boolean; roles: string[]; permissions: string[]; mfaVerified: boolean }
export const label = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const minor = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v) / 100);
