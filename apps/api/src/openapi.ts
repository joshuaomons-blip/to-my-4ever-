/* Writes the OpenAPI document to docs/api/openapi.json (run in CI to keep docs current). */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildOpenApi, createApp } from './bootstrap';

createApp({ logger: false }).then(async (app) => {
  const doc = buildOpenApi(app);
  const out = join(__dirname, '..', '..', '..', 'docs', 'api');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'openapi.json'), JSON.stringify(doc, null, 2));
  await app.close();
  console.log(`wrote ${Object.keys(doc.paths).length} paths to docs/api/openapi.json`);
  process.exit(0);
});
