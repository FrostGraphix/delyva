// Starts the REAL API for the admin-web E2E: fresh database delyva_adminweb_e2e (migrate + seeds),
// Redis db 6 with BULLMQ_PREFIX=adminweb-e2e, port 3323, fake providers, dev OTP.
import { createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const pg = require('pg');

const ADMIN_URL =
  process.env.E2E_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/postgres';
const DB = 'delyva_adminweb_e2e';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${DB}`);

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '3323',
  LOG_LEVEL: 'warn',
  DATABASE_URL: DB_URL,
  REDIS_URL: 'redis://127.0.0.1:56379/6',
  BULLMQ_PREFIX: 'adminweb-e2e',
  HASH_PEPPER: 'adminweb-e2e-pepper-0123456789abcdef0123',
  JWT_ISSUER: 'https://api.delyva.local',
  JWT_AUDIENCE: 'delyva-apps',
  SMS_PROVIDER: 'dev',
  PAYMENTS_PROVIDER: 'fake',
  PAYMENTS_FAKE_WEBHOOK_SECRET: 'adminweb-e2e-webhook-secret',
  KYC_PROVIDER: 'fake',
  STORAGE_PROVIDER: 'local',
  STORAGE_LOCAL_DIR: path.join(root, 'tests/e2e/admin/.data/uploads'),
  STORAGE_SIGNING_SECRET: 'adminweb-e2e-storage-secret-0123456789',
  PUBLIC_API_URL: 'http://127.0.0.1:3323',
};
mkdirSync(env.STORAGE_LOCAL_DIR, { recursive: true });

// Redis db 6 outlives runs: drop only OUR per-IP OTP rate-limit keys (hash is peppered with our
// HASH_PEPPER, so other agents' keys are untouched) so repeated local runs do not exhaust 10/10min.
const { Redis } = require('ioredis');
const redis = new Redis(env.REDIS_URL);
for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
  const hash = createHmac('sha256', env.HASH_PEPPER).update(`ip:${ip}`).digest('hex');
  const keys = await redis.keys(`*rl:otp-send:ip:${hash}*`);
  if (keys.length > 0) await redis.del(...keys);
}
// Stale BullMQ jobs from earlier runs (our prefix only) would point at orders of the dropped DB.
const stale = await redis.keys(`${env.BULLMQ_PREFIX}:*`);
if (stale.length > 0) await redis.del(...stale);
redis.disconnect();

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
await admin.query(
  'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
  [DB],
);
await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
await admin.query(`CREATE DATABASE ${DB} TEMPLATE template_postgis`);
await admin.end();

const dist = path.join(root, 'apps/api/dist');
for (const script of ['migrate', 'seed-catalog', 'seed-pricing']) {
  const r = spawnSync(process.execPath, [path.join(dist, 'scripts', `${script}.js`)], {
    env,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const api = spawn(process.execPath, [path.join(dist, 'src/main.js')], { env, stdio: 'inherit' });
api.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => api.kill());
