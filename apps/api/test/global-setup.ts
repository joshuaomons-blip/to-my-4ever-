import { Client } from 'pg';
import Redis from 'ioredis';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://aureon:aureon@localhost:5432/aureon_test';
  const c = new Client({ connectionString: url });
  await c.connect();
  // Fresh schema each run (append-only triggers block TRUNCATE/DELETE, so drop the schemas instead).
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS sandbox_partner CASCADE; CREATE SCHEMA public;');
  await c.end();
  await migrate(url, () => undefined);
  await seed(url, { log: () => undefined });
  const r = new Redis(process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15');
  await r.flushdb();
  r.disconnect();
}
