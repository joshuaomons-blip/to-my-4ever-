/* Forward-only SQL migration runner with checksum verification. */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

export type MigrationFile = { name: string; sql: string };

/** Migrations from apps/api/migrations, or the JSON bundle generated for serverless builds. */
export function loadMigrations(): MigrationFile[] {
  const dir = join(__dirname, '..', '..', 'migrations');
  if (existsSync(dir)) {
    return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../migrations-bundle.json') as MigrationFile[];
}

export async function migrate(databaseUrl: string, log: (m: string) => void = console.log): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    await client.query('SELECT pg_advisory_lock(424242)');
    const files = loadMigrations();
    const applied = new Map(
      (await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );
    for (const { name: file, sql } of files) {
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = applied.get(file);
      if (prior) {
        if (prior !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
        continue;
      }
      log(`applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    await client.query('SELECT pg_advisory_unlock(424242)');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  migrate(url).then(
    () => console.log('migrations complete'),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
