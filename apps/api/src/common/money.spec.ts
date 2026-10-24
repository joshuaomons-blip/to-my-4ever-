import { Decimal, fromMinor, roundToMinor, toMinor } from './money';
import { decryptField, encryptField } from './crypto';

describe('money', () => {
  it('converts decimal strings to minor units exactly', () => {
    expect(toMinor('0.10', 'USD')).toBe(10n);
    expect(toMinor('12345678.99', 'USD')).toBe(1234567899n);
    expect(() => toMinor('1.001', 'USD')).toThrow(/precision/);
    expect(fromMinor(-1050n, 'USD')).toBe('-10.50');
  });
  it('rounds estimates up and avoids float error', () => {
    expect(roundToMinor(new Decimal('0.1').add('0.2'), 'USD')).toBe(30n);
    expect(roundToMinor(new Decimal('10.001'), 'USD')).toBe(1001n);
  });
});

describe('field encryption', () => {
  const key = Buffer.alloc(32, 3);
  it('round-trips and binds ciphertext to its context (AAD)', () => {
    const ct = encryptField(key, 'QQ123456C', 'tax:u1');
    expect(ct).not.toContain('QQ123456C');
    expect(decryptField(key, ct, 'tax:u1')).toBe('QQ123456C');
    expect(() => decryptField(key, ct, 'tax:u2')).toThrow();
  });
});
