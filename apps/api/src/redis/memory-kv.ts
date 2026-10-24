/**
 * In-process stand-in for the small Redis surface the API uses (get/set EX NX/del/incr/expire/multi/ping).
 * SANDBOX ONLY (enforced in config): state is per process, so on serverless hosting rate limits and
 * TOTP replay protection apply per instance rather than globally.
 */
type Entry = { value: string; expiresAt: number | null };

export class MemoryKv {
  readonly status = 'ready';
  private readonly store = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  /** Supports set(key, value), set(key, value, 'EX', seconds) and set(key, value, 'EX', seconds, 'NX'). */
  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    let ttl: number | null = null;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'EX') ttl = Number(args[++i]);
      else if (a === 'NX') nx = true;
    }
    if (nx && this.live(key)) return null;
    this.store.set(key, { value, expiresAt: ttl ? Date.now() + ttl * 1000 : null });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async incr(key: string): Promise<number> {
    const e = this.live(key);
    const next = Number(e?.value ?? 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.live(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      incr: (k: string) => (ops.push(() => this.incr(k)), chain),
      expire: (k: string, s: number) => (ops.push(() => this.expire(k, s)), chain),
      exec: async (): Promise<Array<[null, unknown]>> => {
        const out: Array<[null, unknown]> = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return chain;
  }

  on(): this {
    return this;
  }

  async connect(): Promise<void> {}

  disconnect(): void {
    this.store.clear();
  }
}
