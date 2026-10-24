/**
 * Serverless adapter (used by the Netlify function in apps/web/netlify/functions).
 *
 * Boots the full Nest API once per container on a loopback port, then proxies each incoming web
 * Request to it. There is no long-running worker on serverless hosts, so durable jobs are drained
 * after each request (`afterResponse`) and by a scheduled function (`maintenance`).
 */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'net';
import { createApp } from './bootstrap';
import { BROKER_ADAPTER, BrokerAdapter } from './brokerage/broker-adapter';
import { SandboxBrokerAdapter } from './brokerage/sandbox-broker.adapter';
import { migrate } from './database/migrate';
import { seed } from './database/seed';
import { JobsService } from './jobs/jobs.service';
import { Scheduler } from './jobs/scheduler';

interface Booted {
  app: INestApplication;
  port: number;
}

let booting: Promise<Booted> | null = null;

async function boot(): Promise<Booted> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  if (process.env.AUTO_MIGRATE === 'true') {
    // Idempotent and checksum-verified; safe to run on every cold start.
    await migrate(url, () => undefined);
    await seed(url, {
      log: () => undefined,
      adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
      adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
      adminMfaAtFirstLogin: true,
    });
  }
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  return { app, port };
}

export function getApp(): Promise<Booted> {
  if (!booting) {
    booting = boot().catch((e) => {
      booting = null; // retry on the next request
      throw e;
    });
  }
  return booting;
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'host', 'content-encoding']);

/** Proxy a web Request (path prefixed with /api) to the in-process API. */
export async function handle(req: Request, clientIp?: string): Promise<Response> {
  const { port } = await getApp();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k) && k !== 'x-forwarded-for') headers.set(k, v);
  });
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', 'https');
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());
  const res = await fetch(`http://127.0.0.1:${port}${path}${url.search}`, { method: req.method, headers, body, redirect: 'manual' });
  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k) && k !== 'set-cookie') out.set(k, v);
  });
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status, headers: out });
}

/** Process due jobs for up to `budgetMs`, re-checking once for jobs scheduled a moment later. */
export async function drainJobs(budgetMs = 4_000, waitForDelayed = true): Promise<void> {
  const { app } = await getApp();
  const jobs = app.get(JobsService);
  const broker = app.get<BrokerAdapter>(BROKER_ADAPTER);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (broker instanceof SandboxBrokerAdapter) await broker.tick();
    const n = await jobs.runOnce(20);
    if (n === 0) {
      if (!waitForDelayed || Date.now() + 1_200 > deadline) break;
      await new Promise((r) => setTimeout(r, 1_100)); // e.g. sandbox payment webhooks delivered after ~1s
      if ((await jobs.runOnce(20)) === 0) break;
    }
  }
}

/** Scheduled entry point: enqueue periodic work, then drain. */
export async function maintenance(budgetMs = 20_000): Promise<void> {
  const { app } = await getApp();
  await app.get(Scheduler).runDue();
  await drainJobs(budgetMs);
}
