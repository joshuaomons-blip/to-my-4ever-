import { base32Decode, base32Encode, hotp, totp, verifyTotp } from './totp';

describe('TOTP (RFC 6238 / RFC 4226)', () => {
  // RFC 4226 Appendix D test secret "12345678901234567890".
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches RFC 4226 HOTP test vectors', () => {
    expect(['755224', '287082', '359152', '969429', '338314'].map((_, i) => hotp(secret, i))).toEqual(['755224', '287082', '359152', '969429', '338314']);
  });
  it('matches RFC 6238 SHA-1 vector at T=59s (last 6 digits of 94287082)', () => {
    expect(totp(secret, 59_000)).toBe('287082');
  });
  it('accepts ±1 step drift and rejects others', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, 'abc123', now)).toBeNull();
  });
  it('round-trips base32', () => {
    const b = Buffer.from([0, 1, 2, 250, 255]);
    expect(base32Decode(base32Encode(b))).toEqual(b);
  });
});
