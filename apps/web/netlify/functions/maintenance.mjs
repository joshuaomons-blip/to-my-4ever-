// Netlify Scheduled Function: periodic platform work (sandbox partner fills, order sync, settlement,
// daily reconciliation at 06:00 UTC) — replaces the long-running worker on serverless hosting.
import { getConnectionString } from '@netlify/database';

export default async () => {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = getConnectionString();
  const mod = await import('../../../api/dist/serverless.js');
  await (mod.default ?? mod).maintenance(20_000);
};

// Every minute (UTC). Scheduled functions have a 30s limit; the drain budget is 20s.
export const config = { schedule: '* * * * *' };
