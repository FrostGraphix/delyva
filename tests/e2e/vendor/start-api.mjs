// Prepares the dedicated E2E database (drop/create, migrate, seed) and runs the REAL built API.
// Own DB delyva_vendorweb_e2e, Redis db 5 (only this suite's keys; never flushes other dbs).
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const api = path.join(root, 'apps/api');
const ADMIN =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB = 'delyva_vendorweb_e2e';
const DB_URL = ADMIN.replace(/\/[^/]+$/, `/${DB}`);
const PEPPER = 'e2e-vendorweb-pepper-0123456789abcdef0123';

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '3342',
  LOG_LEVEL: 'warn',
  DATABASE_URL: DB_URL,
  REDIS_URL: 'redis://127.0.0.1:56379/5',
  BULLMQ_PREFIX: 'vendorweb-e2e',
  HASH_PEPPER: PEPPER,
  JWT_ISSUER: 'https://api.delyva.test',
  JWT_AUDIENCE: 'delyva-apps',
  SMS_PROVIDER: 'dev',
  PAYMENTS_PROVIDER: 'fake',
  PAYMENTS_FAKE_WEBHOOK_SECRET: 'e2e-vendorweb-fake-webhook-secret',
  KYC_PROVIDER: 'fake',
  STORAGE_PROVIDER: 'local',
  STORAGE_LOCAL_DIR: path.join(root, '.data/vendorweb-e2e-uploads'),
  STORAGE_SIGNING_SECRET: 'e2e-vendorweb-storage-signing-secret-0123456789',
  PUBLIC_API_URL: 'http://127.0.0.1:3342',
  ORDERING_AUTO_REJECT_SECONDS: '300',
  NOTIFICATIONS_CONSUMER_ENABLED: 'false',
};

const admin = new pg.Client({ connectionString: ADMIN });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${DB}`);
await admin.end();

for (const script of ['migrate', 'seed-catalog', 'seed-pricing']) {
  const r = spawnSync(process.execPath, [path.join(api, `dist/scripts/${script}.js`)], {
    env,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Make seeded vendor 1 the only store of the demo owner and open 24/7, so the run is deterministic.
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const V1 = '20000000-0000-4000-8000-0000000003e8';
const B1 = '21000000-0000-4000-8000-0000000003e8';
await db.query('DELETE FROM vendor_members WHERE user_id = $1 AND vendor_id <> $2', [
  '30000000-0000-4000-8000-000000000001',
  V1,
]);
await db.query('DELETE FROM branch_opening_hours WHERE branch_id = $1', [B1]);
for (let d = 0; d < 7; d++) {
  await db.query(
    "INSERT INTO branch_opening_hours (id, branch_id, day_of_week, opens_at, closes_at) VALUES (gen_random_uuid(),$1,$2,'00:00','24:00')",
    [B1, d],
  );
}
await db.end();

const child = spawn(process.execPath, [path.join(api, 'dist/src/main.js')], { env, stdio: 'inherit' });
const stop = () => child.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
