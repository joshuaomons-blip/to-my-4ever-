import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const sha256 = (input: string | Buffer): Buffer => createHash('sha256').update(input).digest();
export const sha256Hex = (input: string | Buffer): string => sha256(input).toString('hex');

/** URL-safe random token with >= 256 bits of entropy. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ab = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * AES-256-GCM envelope for field-level encryption (MFA secrets, tax IDs).
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url). In production the key comes from a KMS/secret manager.
 */
export function encryptField(key: Buffer, plaintext: string, aad = ''): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptField(key: Buffer, envelope: string, aad = ''): string {
  const [v, iv, tag, ct] = envelope.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported ciphertext envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
