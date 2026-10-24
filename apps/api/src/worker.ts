import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JobsService } from './jobs/jobs.service';
import { Scheduler } from './jobs/scheduler';

/** Background worker: durable job processing and periodic scheduling. Scale horizontally; jobs use SKIP LOCKED. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? new ConsoleLogger({ json: true }) : undefined,
  });
  const jobs = app.get(JobsService);
  const scheduler = app.get(Scheduler);
  jobs.start(Number(process.env.WORKER_POLL_MS ?? 500));
  scheduler.start();
  new Logger('Worker').log('worker started');
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    scheduler.stop();
    jobs.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
