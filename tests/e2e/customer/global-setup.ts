import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Redis } from 'ioredis';
import pg from 'pg';
import {
  ADMIN_DB_URL,
  API_PORT,
  API_URL,
  DATABASE_URL,
  DB_NAME,
  REDIS_URL,
  WEBHOOK_SECRET,
} from './env.js';
import { startWebServer } from './static-proxy.js';

const root = resolve(import.meta.dirname, '../../..');
const apiDir = join(root, 'apps/api');
const appDir = join(root, 'apps/customer-mobile');

interface State {
  api?: ChildProcess;
  web?: { close: () => void };
}
const holder = globalThis as { __e2e?: State };
holder.__e2e ??= {};
const state: State = holder.__e2e;

const apiEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
  DATABASE_URL,
  REDIS_URL,
  HASH_PEPPER: 'e2e-pepper-e2e-pepper-e2e-pepper-e2e-pepper',
  JWT_ISSUER: 'https://api.delyva.local',
  JWT_AUDIENCE: 'delyva-apps',
  SMS_PROVIDER: 'dev',
  PAYMENTS_PROVIDER: 'fake',
  PAYMENTS_FAKE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  PUBLIC_API_URL: API_URL,
  BULLMQ_PREFIX: 'custapp-e2e',
};

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = apiEnv): void {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${String(r.status)})`);
}

async function recreateDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  await db.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await db.end();
}

async function waitForApi(): Promise<void> {
  for (let i = 0; i < 180; i++) {
    if (state.api?.exitCode != null)
      throw new Error(`API exited early (${String(state.api.exitCode)})`);
    try {
      if ((await fetch(`${API_URL}/healthz`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API did not become healthy');
}

/** Provisions own DB + Redis db 7, migrates and seeds, starts the API and the web server. */
export default async function globalSetup(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  await redis.flushdb();
  await redis.quit();
  await recreateDatabase();
  run('node', ['dist/scripts/migrate.js'], apiDir);
  run('node', ['dist/scripts/seed-catalog.js'], apiDir);
  run('node', ['dist/scripts/seed-pricing.js'], apiDir);
  if (!process.env.E2E_SKIP_WEB_BUILD) {
    run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web'], appDir, {
      ...process.env,
      EXPO_PUBLIC_API_URL: '',
    });
  }
  state.api = spawn('node', ['dist/src/main.js'], { cwd: apiDir, env: apiEnv, stdio: 'inherit' });
  await waitForApi();
  state.web = await startWebServer(join(appDir, 'dist-web'));
}
