import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import type { ClientToServerEvents, ServerToClientEvents } from '@delyva/contracts';
import { Redis } from 'ioredis';
import pg from 'pg';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { DEMO_OWNER, seedCatalog, seedVendorId } from '../scripts/seed-catalog.js';
import { createApp } from '../src/create-app.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Vendor portal bootstrap endpoints (ADR 0820): GET /v1/me/vendors and single-use realtime
 * tickets. Own database `delyva_vendorportal_test`, Redis db 5 (never flushed; keys are random).
 * SKIPS with a message when the services are unreachable; never fake-passes.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_NAME = 'delyva_vendorportal_test';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
const REDIS_URL = process.env.TEST_VENDOR_PORTAL_REDIS_URL ?? 'redis://127.0.0.1:56379/5';
const PEPPER = 'integration-test-pepper-0123456789abcdef';

async function servicesAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2_000 });
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
    redis.disconnect();
  }
}

const available = await servicesAvailable();
if (!available) {
  process.stderr.write(
    '\n[SKIP] vendor portal integration tests: Postgres/Redis not reachable.\n\n',
  );
}

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

describe.skipIf(!available)('vendor portal bootstrap (integration: Postgres + Redis)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let signer: JoseAccessTokenSigner;
  let url = '';
  const sockets: Client[] = [];
  const otherOwner = '30000000-0000-4000-8000-0000000000b7';

  const bearer = async (userId: string, roles: string[]): Promise<string> =>
    `Bearer ${(await signer.sign({ userId, roles, deviceId: 'device-vportal-1' })).token}`;

  const connect = (auth: object): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = io(url, { auth, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      s.on('connect', () => {
        resolve(s);
      });
      s.on('connect_error', reject);
    });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    await seedCatalog(DB_URL, PEPPER);
    const pool = new pg.Pool({ connectionString: DB_URL });
    await pool.query(
      "INSERT INTO vendor_members (vendor_id, user_id, role) VALUES ($1,$2,'staff')",
      [seedVendorId(7), otherOwner],
    );
    await pool.end();
    process.env.OUTBOX_PUBLISHER_DISABLED = 'true';
    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: DB_URL,
      REDIS_URL,
      HASH_PEPPER: PEPPER,
      JWT_ISSUER: 'https://api.delyva.test',
      JWT_AUDIENCE: 'delyva-apps',
      SMS_PROVIDER: 'dev',
      BULLMQ_PREFIX: 'vendorportal-it',
      NOTIFICATIONS_CONSUMER_ENABLED: 'false',
      ORDERING_JOBS_ENABLED: 'false',
    });
    ({ app } = await createApp(env));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${String((app.getHttpServer() as { address(): AddressInfo }).address().port)}`;
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
    signer = app.get(JoseAccessTokenSigner);
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app.close();
  });

  it('lists only the caller’s own vendor memberships with branch ids', async () => {
    const res = await http
      .get('/v1/me/vendors')
      .set('authorization', await bearer(DEMO_OWNER.id, ['customer', 'vendor_owner']))
      .expect(200);
    const items = (res.body as { items: { id: string; role: string; branchIds: string[] }[] })
      .items;
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(items.every((v) => v.role === 'owner' && v.branchIds.length > 0)).toBe(true);

    const other = await http
      .get('/v1/me/vendors')
      .set('authorization', await bearer(otherOwner, ['vendor_staff']))
      .expect(200);
    expect((other.body as { items: { id: string }[] }).items.map((v) => v.id)).toEqual([
      seedVendorId(7),
    ]);
  });

  it('rejects anonymous callers and non-vendor roles', async () => {
    await http.get('/v1/me/vendors').expect(401);
    await http
      .get('/v1/me/vendors')
      .set('authorization', await bearer(otherOwner, ['customer']))
      .expect(403);
  });

  it('mints a ticket that authenticates exactly one socket handshake', async () => {
    const res = await http
      .post('/v1/realtime/tickets')
      .set('authorization', await bearer(DEMO_OWNER.id, ['vendor_owner']))
      .expect(201);
    const { ticket, expiresInSeconds } = res.body as { ticket: string; expiresInSeconds: number };
    expect(expiresInSeconds).toBe(60);
    const s = await connect({ ticket });
    expect(s.connected).toBe(true);
    await expect(connect({ ticket })).rejects.toThrow('unauthorized');
    await expect(connect({ ticket: 'f'.repeat(64) })).rejects.toThrow('unauthorized');
  });

  it('requires auth to mint a ticket', async () => {
    await http.post('/v1/realtime/tickets').expect(401);
  });
});
