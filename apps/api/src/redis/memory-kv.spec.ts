import { MemoryKv } from './memory-kv';

describe('MemoryKv (sandbox Redis stand-in)', () => {
  it('supports SET NX EX semantics used for TOTP replay protection', async () => {
    const kv = new MemoryKv();
    expect(await kv.set('k', '1', 'EX', 60, 'NX')).toBe('OK');
    expect(await kv.set('k', '1', 'EX', 60, 'NX')).toBeNull();
    expect(await kv.get('k')).toBe('1');
  });
  it('expires keys and counts with multi/incr/expire like the rate limiter', async () => {
    const kv = new MemoryKv();
    const r1 = await kv.multi().incr('c').expire('c', 60).exec();
    const r2 = await kv.multi().incr('c').expire('c', 60).exec();
    expect(r1[0]![1]).toBe(1);
    expect(r2[0]![1]).toBe(2);
    await kv.set('t', 'x', 'EX', 0.001);
    await new Promise((r) => setTimeout(r, 10));
    expect(await kv.get('t')).toBeNull();
  });
});
