/*
 * Bundles dist/serverless.js and its dependencies into one CommonJS file inside the web app's
 * Netlify functions folder, so the host's function bundler has nothing to resolve across the
 * pnpm workspace. Only the native argon2 binding stays external (declared by @aureon/web).
 */
const { build } = require('esbuild');
const { join } = require('path');

// Optional Nest integrations that are required lazily inside try/catch and are not installed.
const optional = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  '@nestjs/platform-socket.io',
  '@fastify/static',
  'class-transformer/storage',
];

build({
  entryPoints: [join(__dirname, 'dist', 'serverless.js')],
  outfile: join(__dirname, '..', 'web', 'netlify', 'api-bundle', 'serverless.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  keepNames: true,
  external: ['@node-rs/argon2', ...optional],
  logLevel: 'warning',
}).then(() => console.log('bundled serverless API'));
