import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/config';
import { JobsService } from './jobs/jobs.service';
import { Scheduler } from './jobs/scheduler';

async function main() {
  const app = await createApp();
  const cfg = app.get<AppConfig>(APP_CONFIG);
  // For single-process development only; production runs `worker.js` as a separate service.
  if (process.env.RUN_WORKER_IN_PROCESS === 'true') {
    app.get(JobsService).start(500);
    app.get(Scheduler).start();
  }
  await app.listen(cfg.port);
  new Logger('Bootstrap').log(`API listening on :${cfg.port} (${cfg.operatingMode} mode)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
