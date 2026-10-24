import { redact } from './audit.service';

describe('audit metadata redaction', () => {
  it('redacts secrets and drops prototype-polluting keys', () => {
    const meta = JSON.parse('{"password":"x","nested":{"code":"123456","ok":1},"__proto__":{"polluted":true},"amount":"10"}');
    const out = redact(meta);
    expect(out.password).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).code).toBe('[REDACTED]');
    expect(out.amount).toBe('10');
    expect(Object.keys(out)).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
