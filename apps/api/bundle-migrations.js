/* Writes dist/migrations-bundle.json so serverless bundles carry the SQL without loose files. */
const { readdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const dir = join(__dirname, 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
writeFileSync(join(__dirname, 'dist', 'migrations-bundle.json'), JSON.stringify(files.map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))));
console.log(`bundled ${files.length} migrations`);
