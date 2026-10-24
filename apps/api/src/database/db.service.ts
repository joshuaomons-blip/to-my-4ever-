import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/config';

// int8 -> bigint (minor units must never lose precision); numeric stays a string for decimal.js.
types.setTypeParser(20, (v) => BigInt(v));

export type Queryable = Pick<PoolClient, 'query'>;

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    this.pool = new Pool({
      connectionString: cfg.databaseUrl,
      max: Number(process.env.PG_POOL_MAX ?? 20),
      idleTimeoutMillis: 30_000,
      // 0 disables the startup parameter (some transaction poolers reject it).
      ...(cfg.pgStatementTimeoutMs > 0 ? { statement_timeout: cfg.pgStatementTimeoutMs } : {}),
      application_name: 'aureon-api',
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query<T>(sql, params);
    return res.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  /** Run fn in a transaction, retrying on serialization failures/deadlocks. */
  async tx<T>(fn: (c: PoolClient) => Promise<T>, opts: { retries?: number; isolation?: 'read committed' | 'repeatable read' | 'serializable' } = {}): Promise<T> {
    const retries = opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query(`BEGIN ISOLATION LEVEL ${(opts.isolation ?? 'read committed').toUpperCase()}`);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code && RETRYABLE.has(code) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 20));
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
  }

  private ended = false;

  async onModuleDestroy(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    await this.pool.end();
  }
}

export async function rows<T extends QueryResultRow>(c: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query<T>(sql, params)).rows;
}

export async function row<T extends QueryResultRow>(c: Queryable, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await c.query<T>(sql, params)).rows[0];
}
