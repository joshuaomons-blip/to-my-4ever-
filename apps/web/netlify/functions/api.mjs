// Netlify Function: serves the platform API at /api/* by proxying to the in-process NestJS app
// (apps/api/src/serverless.ts). Database: Netlify Database (Postgres), via @netlify/database.
import '../runtime-env.mjs';
import { getConnectionString } from '@netlify/database';

let modPromise;
function load() {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = getConnectionString();
  modPromise ??= import('../api-bundle/serverless.cjs').then((m) => m.default ?? m);
  return modPromise;
}

export default async (req, context) => {
  let api;
  try {
    api = await load();
    const res = await api.handle(req, context.ip);
    // No long-running worker here: process due jobs after responding. Mutations may schedule follow-up
    // work (e.g. sandbox payment webhooks ~1s later), so they get a longer budget.
    const mutating = req.method !== 'GET' && req.method !== 'HEAD';
    context.waitUntil(api.drainJobs(mutating ? 4_000 : 800, mutating).catch((e) => console.error('drain failed', e)));
    return res;
  } catch (e) {
    console.error('api function error', e);
    return Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is starting or temporarily unavailable. Please retry.' } }, { status: 503 });
  }
};

export const config = { path: '/api/*' };
