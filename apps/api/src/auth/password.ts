import { hash, verify } from '@node-rs/argon2';
import { AppError } from '../common/errors';

// algorithm 2 = Argon2id (const enum in @node-rs/argon2); parameters follow OWASP minimums.
const OPTS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// A small deny-list; production should also check a breached-password service (k-anonymity API).
const COMMON = new Set([
  'password1234', 'passwordpassword', '123456789012', 'qwertyuiopas', 'letmein12345', 'administrator',
  'iloveyou1234', 'welcome12345', 'aureoncapital', 'changeme1234',
]);

export function assertPasswordPolicy(password: string, email?: string): void {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new AppError('WEAK_PASSWORD', 'Password must be between 12 and 128 characters', 400);
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    throw new AppError('WEAK_PASSWORD', 'This password is too common', 400);
  }
  if (email && lower.includes(email.split('@')[0]!.toLowerCase()) && email.split('@')[0]!.length >= 4) {
    throw new AppError('WEAK_PASSWORD', 'Password must not contain your email name', 400);
  }
}

export const hashPassword = (pw: string): Promise<string> => hash(pw, OPTS);
export const verifyPassword = async (hashStr: string, pw: string): Promise<boolean> => {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
};
// Used to equalise timing when the account does not exist.
export const DUMMY_HASH_PROMISE = hash('timing-equaliser-not-a-password', OPTS);
