import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { runPricingSeed } from '../scripts/seed-pricing.js';
import { createApp } from '../src/create-app.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import type { PricingError } from '../src/modules/pricing/domain/pricing-errors.js';
import { RedeemPromo } from '../src/modules/pricing/application/redeem-promo.use-case.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Pricing integration tests against the real Postgres+PostGIS and Redis (infra/docker-compose.yml),
 * using a dedicated database. They SKIP (with a message) when services are unreachable.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_NAME = 'delyva_pricing_test';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
const REDIS_URL = process.env.TEST_PRICING_REDIS_URL ?? 'redis://127.0.0.1:56379/14';

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
  process.stderr.write('\n[SKIP] pricing integration tests: Postgres/Redis not reachable.\n\n');
}

type Body = Record<string, unknown>;
const b = (r: request.Response): Body => r.body as Body;

/** Lekki Phase 1 → Victoria Island (~4–5 km straight line). */
const pickup = { lat: 6.4474, lng: 3.4723 };
const dropoff = { lat: 6.4281, lng: 3.4219 };

describe.skipIf(!available)('pricing API (integration: Postgres + Redis)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let redis: Redis;
  let http: ReturnType<typeof request>;
  let customer: string;
  let ops: string;
  const customerId = randomUUID();

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    await runPricingSeed(DB_URL);
    await runPricingSeed(DB_URL); // idempotent
    redis = new Redis(REDIS_URL);
    await redis.flushdb();
    pool = new pg.Pool({ connectionString: DB_URL });
    process.env.OUTBOX_PUBLISHER_DISABLED = 'true';
    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: DB_URL,
      REDIS_URL,
      HASH_PEPPER: 'integration-test-pepper-0123456789abcdef',
      JWT_ISSUER: 'https://api.delyva.test',
      JWT_AUDIENCE: 'delyva-apps',
      SMS_PROVIDER: 'dev',
    });
    ({ app } = await createApp(env));
    await app.init();
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
    const signer = app.get(JoseAccessTokenSigner);
    const sign = async (userId: string, roles: string[]) =>
      (await signer.sign({ userId, roles, deviceId: 'device-test-1' })).token;
    customer = await sign(customerId, ['customer']);
    ops = await sign(randomUUID(), ['ops']);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    redis.disconnect();
  });

  const quote = (body: object, token = customer) =>
    http.post('/v1/quotes').set('Authorization', `Bearer ${token}`).send(body);
  const cart = {
    zoneCode: 'lagos',
    pickup,
    dropoff,
    lines: [{ unitPriceMinor: 350_000, quantity: 1 }],
  };

  it('requires a valid Bearer token', async () => {
    const none = await http.post('/v1/quotes').send(cart).expect(401);
    expect(none.headers['content-type']).toContain('application/problem+json');
    expect(b(none).code).toBe('unauthorized');
    await quote(cart, 'not-a-jwt').expect(401);
  });

  it('returns a consistent itemised breakdown in kobo', async () => {
    const res = await quote(cart).expect(200);
    const q = b(res) as Record<string, number>;
    expect(q.itemsSubtotalMinor).toBe(350_000);
    expect(q.deliveryFeeMinor).toBeGreaterThan(30_000);
    expect(q.totalMinor).toBe(
      (q.itemsSubtotalMinor ?? 0) +
        (q.deliveryFeeMinor ?? 0) +
        (q.surgeFeeMinor ?? 0) +
        (q.smallOrderFeeMinor ?? 0) +
        (q.serviceFeeMinor ?? 0) +
        (q.vatMinor ?? 0) -
        (q.discountMinor ?? 0),
    );
    expect(b(res).promo).toBeNull();
  });

  it('applies TUNDE50 for a new customer and reports unknown codes', async () => {
    const res = await quote({ ...cart, promoCode: 'tunde50' }).expect(200);
    expect(b(res).promo).toEqual({ code: 'TUNDE50', applied: true, discountMinor: 50_000 });
    expect(b(res).discountMinor).toBe(50_000);
    const unknown = await quote({ ...cart, promoCode: 'NOPE99' }).expect(200);
    expect(b(unknown).promo).toMatchObject({ applied: false, reason: 'not_found' });
  });

  it('validates input and rejects unknown zones and far addresses', async () => {
    expect(b(await quote({ ...cart, lines: [] }).expect(400)).code).toBe('validation_failed');
    expect(b(await quote({ ...cart, zoneCode: 'abuja' }).expect(422)).code).toBe(
      'zone_not_serviceable',
    );
    const ibadan = { lat: 7.3775, lng: 3.947 };
    expect(b(await quote({ ...cart, dropoff: ibadan }).expect(422)).code).toBe(
      'zone_not_serviceable',
    );
  });

  it('forbids customers from admin routes (403) and allows ops', async () => {
    for (const path of ['/v1/admin/fee-rules', '/v1/admin/promos', '/v1/admin/surge-rules']) {
      const res = await http.get(path).set('Authorization', `Bearer ${customer}`).expect(403);
      expect(b(res).code).toBe('forbidden');
      await http.get(path).expect(401);
    }
    const rules = await http
      .get('/v1/admin/fee-rules')
      .set('Authorization', `Bearer ${ops}`)
      .expect(200);
    expect((b(rules).items as Body[]).map((r) => r.zoneCode)).toEqual(['lagos']);
    await http
      .patch(`/v1/admin/promos/${randomUUID()}`)
      .set('Authorization', `Bearer ${customer}`)
      .send({ active: false })
      .expect(403);
  });

  it('lets ops create and patch promos with idempotent creates', async () => {
    const body = {
      code: 'TEST10',
      type: 'percent_off',
      valueMinor: null,
      percentBps: 1_000,
      maxDiscountMinor: 100_000,
      minOrderMinor: 0,
      audience: 'all',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2028-01-01T00:00:00Z',
      activeDaysOfWeek: null,
      perUserLimit: 3,
      globalLimit: 1,
      budgetMinor: 1_000_000,
      active: true,
    };
    const post = () =>
      http
        .post('/v1/admin/promos')
        .set('Authorization', `Bearer ${ops}`)
        .set('Idempotency-Key', 'promo-create-test10')
        .send(body);
    const created = await post().expect(201);
    const replay = await post().expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const dup = await http
      .post('/v1/admin/promos')
      .set('Authorization', `Bearer ${ops}`)
      .set('Idempotency-Key', 'promo-create-test10-b')
      .send(body)
      .expect(409);
    expect(b(dup).code).toBe('conflict');
    const id = String(b(created).id);
    const patched = await http
      .patch(`/v1/admin/promos/${id}`)
      .set('Authorization', `Bearer ${ops}`)
      .send({ minOrderMinor: 10_000 })
      .expect(200);
    expect(b(patched).minOrderMinor).toBe(10_000);
    await http
      .patch('/v1/admin/promos/not-a-uuid')
      .set('Authorization', `Bearer ${ops}`)
      .send({})
      .expect(400);
    await http
      .patch(`/v1/admin/promos/${randomUUID()}`)
      .set('Authorization', `Bearer ${ops}`)
      .send({})
      .expect(404);
  });

  it('serialises concurrent redemptions: exactly one wins a global limit of 1', async () => {
    const redeem = app.get(RedeemPromo);
    const attempts = Array.from({ length: 8 }, () =>
      redeem
        .execute({
          code: 'TEST10',
          userId: randomUUID(),
          orderId: randomUUID(),
          itemsSubtotalMinor: 500_000,
          discountMinor: 50_000,
        })
        .then(
          () => 'ok',
          (e: unknown) => (e as PricingError).code,
        ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'promo_ineligible')).toHaveLength(7);
    const { rows } = await pool.query<{ redemption_count: number; spent_minor: string }>(
      "SELECT redemption_count, spent_minor FROM promos WHERE code = 'TEST10'",
    );
    expect(rows[0]).toEqual({ redemption_count: 1, spent_minor: '50000' });
  });

  it('redeems idempotently per order and emits pricing.promo.redeemed', async () => {
    const redeem = app.get(RedeemPromo);
    const cmd = {
      code: 'TUNDE50',
      userId: customerId,
      orderId: randomUUID(),
      itemsSubtotalMinor: 350_000,
      discountMinor: 50_000,
    };
    const first = await redeem.execute(cmd);
    const again = await redeem.execute(cmd);
    expect(again).toEqual({ redemption: first.redemption, replayed: true });
    const { rows } = await pool.query<{ type: string; payload: Body }>(
      "SELECT type, payload FROM outbox_events WHERE type = 'pricing.promo.redeemed' AND payload->>'code' = 'TUNDE50'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({ orderId: cmd.orderId, discountMinor: 50_000 });
    const after = await quote({ ...cart, promoCode: 'TUNDE50' }).expect(200);
    expect(b(after).promo).toMatchObject({ applied: false, reason: 'audience_mismatch' });
  });

  it('enforces the budget CHECK constraint at the database level', async () => {
    await expect(
      pool.query("UPDATE promos SET spent_minor = budget_minor + 1 WHERE code = 'TUNDE50'"),
    ).rejects.toThrow(/promos_budget/);
  });
});
