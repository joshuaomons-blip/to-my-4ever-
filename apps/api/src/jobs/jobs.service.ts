import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'os';
import { DbService, Queryable } from '../database/db.service';

export type JobHandler = (payload: Record<string, unknown>, job: { id: string; attempts: number }) => Promise<void>;

interface JobRow {
  id: string;
  queue: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

/**
 * Durable Postgres-backed queue. Jobs are enqueued inside the same transaction as the business change
 * (transactional outbox), claimed with FOR UPDATE SKIP LOCKED, retried with exponential backoff and
 * moved to 'dead' after max_attempts for operator review.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly workerId = `${hostname()}:${process.pid}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DbService) {}

  register(queue: string, handler: JobHandler): void {
    this.handlers.set(queue, handler);
  }

  async enqueue(
    q: Queryable,
    queue: string,
    payload: Record<string, unknown>,
    opts: { runAt?: Date; delaySeconds?: number; dedupeKey?: string; maxAttempts?: number } = {},
  ): Promise<void> {
    const runAt = opts.runAt ?? new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000);
    await q.query(
      `INSERT INTO jobs (queue, payload, run_at, dedupe_key, max_attempts) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('pending','running') DO NOTHING`,
      [queue, JSON.stringify(payload), runAt, opts.dedupeKey ?? null, opts.maxAttempts ?? 8],
    );
  }

  /** Claim and run up to `limit` due jobs. Returns number processed. */
  async runOnce(limit = 10, queues?: string[]): Promise<number> {
    await this.db.query(
      `UPDATE jobs SET status='pending', locked_at=NULL, locked_by=NULL
        WHERE status='running' AND locked_at < now() - interval '5 minutes'`,
    );
    const jobs = await this.db.query<JobRow>(
      `UPDATE jobs SET status='running', locked_at=now(), locked_by=$2, attempts = attempts + 1
        WHERE id IN (SELECT id FROM jobs WHERE status='pending' AND run_at <= now()
                       AND ($3::text[] IS NULL OR queue = ANY($3))
                     ORDER BY run_at, id LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING id, queue, payload, attempts, max_attempts`,
      [limit, this.workerId, queues ?? null],
    );
    for (const job of jobs) {
      const handler = this.handlers.get(job.queue);
      try {
        if (!handler) throw new Error(`No handler for queue ${job.queue}`);
        await handler(job.payload, { id: job.id, attempts: job.attempts });
        await this.db.query(`UPDATE jobs SET status='succeeded', finished_at=now(), locked_at=NULL WHERE id=$1`, [job.id]);
      } catch (e) {
        const msg = (e as Error).message?.slice(0, 2000) ?? String(e);
        const dead = job.attempts >= job.max_attempts;
        const backoff = Math.min(3600, 2 ** job.attempts * 5);
        await this.db.query(
          `UPDATE jobs SET status=$2, last_error=$3, locked_at=NULL, locked_by=NULL,
                  run_at = now() + make_interval(secs => $4), finished_at = CASE WHEN $2='dead' THEN now() END
            WHERE id=$1`,
          [job.id, dead ? 'dead' : 'pending', msg, backoff],
        );
        (dead ? this.logger.error.bind(this.logger) : this.logger.warn.bind(this.logger))(
          `job ${job.id} (${job.queue}) attempt ${job.attempts} failed${dead ? ' — moved to dead letter' : ''}: ${msg}`,
        );
      }
    }
    return jobs.length;
  }

  /** Process until no due jobs remain (tests and CLI). */
  async drain(max = 200, queues?: string[]): Promise<number> {
    let total = 0;
    for (let i = 0; i < max; i++) {
      const n = await this.runOnce(20, queues);
      total += n;
      if (n === 0) break;
    }
    return total;
  }

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.runOnce()
        .catch((e) => this.logger.error(`worker loop error: ${(e as Error).message}`))
        .finally(() => (this.running = false));
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
