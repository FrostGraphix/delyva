import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { DEMO_OWNER, seedBranchId, seedCatalog, seedVendorId } from '../scripts/seed-catalog.js';
import { createApp } from '../src/create-app.js';
import { lagosWeekMinute } from '../src/modules/catalog/domain/opening-hours.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Catalog + geo integration tests against real Postgres/PostGIS and Redis (docker-compose).
 * Own database `delyva_catalog_test` and Redis db 13 so sibling suites don't collide.
 * SKIPS with a message when the services are unreachable; never fake-passes.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, '/delyva_catalog_test');
const REDIS_URL = process.env.TEST_CATALOG_REDIS_URL ?? 'redis://127.0.0.1:56379/13';
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
  process.stderr.write('\n[SKIP] catalog integration tests: Postgres/Redis not reachable.\n\n');
}

// Points (lat,lng)
const VI = { lat: 6.429, lng: 3.418 };
const IKEJA = { lat: 6.6018, lng: 3.3515 };
const IKOYI = { lat: 6.453, lng: 3.437 };

type Body = Record<string, unknown>;
const items = (r: request.Response) => (r.body as { items: Body[] }).items;

describe.skipIf(!available)('catalog + geo API (integration: Postgres/PostGIS + Redis)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let http: ReturnType<typeof request>;
  let signer: JoseAccessTokenSigner;
  let key = 0;
  const idem = () => `catalog-test-${String(Date.now())}-${String(++key)}`;
  const token = async (userId: string, roles: string[]) =>
    `Bearer ${(await signer.sign({ userId, roles, deviceId: 'device-catalog-1' })).token}`;

  const ownerB = '30000000-0000-4000-8000-0000000000b0';
  const staffA = '30000000-0000-4000-8000-0000000000a5';
  const customerA = '30000000-0000-4000-8000-0000000000c1';
  const customerB = '30000000-0000-4000-8000-0000000000c2';
  const opsUser = '30000000-0000-4000-8000-0000000000f1';

  const firstItemOf = async (vendorN: number): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM menu_items WHERE vendor_id = $1 ORDER BY id LIMIT 1',
      [seedVendorId(vendorN)],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('seed item missing');
    return id;
  };

  const setHours = (vendorN: number, hours: [number, string, string][]) =>
    pool
      .query('DELETE FROM branch_opening_hours WHERE branch_id = $1', [seedBranchId(vendorN)])
      .then(() =>
        Promise.all(
          hours.map(([d, o, c]) =>
            pool.query(
              'INSERT INTO branch_opening_hours (id, branch_id, day_of_week, opens_at, closes_at) VALUES (gen_random_uuid(),$1,$2,$3,$4)',
              [seedBranchId(vendorN), d, o, c],
            ),
          ),
        ),
      );

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('DROP DATABASE IF EXISTS delyva_catalog_test WITH (FORCE)');
    await admin.query('CREATE DATABASE delyva_catalog_test');
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    await seedCatalog(DB_URL, PEPPER);
    pool = new pg.Pool({ connectionString: DB_URL });
    // Vendor B owner manages only vendor 7; staff A is staff of vendor 1.
    await pool.query(
      "INSERT INTO vendor_members (vendor_id, user_id, role) VALUES ($1,$2,'owner'), ($3,$4,'staff')",
      [seedVendorId(7), ownerB, seedVendorId(1), staffA],
    );
    const redis = new Redis(REDIS_URL);
    await redis.flushdb();
    redis.disconnect();
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
    });
    ({ app } = await createApp(env));
    await app.init();
    signer = app.get(JoseAccessTokenSigner);
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe('discovery', () => {
    it('returns open, live vendors in the zone with distance, ETA and a null fee', async () => {
      await setHours(
        2,
        [0, 1, 2, 3, 4, 5, 6].map((d) => [d, '00:00', '24:00']),
      );
      const res = await http.get('/v1/vendors').query(VI).expect(200);
      const names = items(res).map((v) => v.name);
      expect(names).toEqual(expect.arrayContaining(['CarePoint Pharmacy VI', 'Suya Republic']));
      for (const v of items(res)) {
        expect(v.zoneId).toBe('10000000-0000-4000-8000-000000000001');
        expect(v.deliveryFee).toBeNull();
        expect(v.distanceMeters).toEqual(expect.any(Number));
        expect(v.etaMinutes).toBeGreaterThan(0);
      }
    });

    it('excludes vendors that are closed right now (Lagos time)', async () => {
      const { dayOfWeek } = lagosWeekMinute(new Date());
      await setHours(2, [[(dayOfWeek + 3) % 7, '10:00', '11:00']]);
      const res = await http.get('/v1/vendors').query(VI).expect(200);
      expect(items(res).map((v) => v.name)).not.toContain('Suya Republic');
      expect(items(res).map((v) => v.name)).toContain('CarePoint Pharmacy VI');
    });

    it('filters by category', async () => {
      const res = await http
        .get('/v1/vendors')
        .query({ ...VI, category: 'restaurant' })
        .expect(200);
      expect(items(res).every((v) => v.category === 'restaurant')).toBe(true);
      expect(items(res).map((v) => v.name)).not.toContain('CarePoint Pharmacy VI');
    });

    it('returns nothing for a point outside every zone', async () => {
      const res = await http.get('/v1/vendors').query(IKEJA).expect(200);
      expect(items(res)).toEqual([]);
    });

    it('never lists vendors that are not live', async () => {
      await setHours(
        8,
        [0, 1, 2, 3, 4, 5, 6].map((d) => [d, '00:00', '24:00']),
      );
      await setHours(
        4,
        [0, 1, 2, 3, 4, 5, 6].map((d) => [d, '00:00', '24:00']),
      );
      const res = await http.get('/v1/vendors').query(IKOYI).expect(200);
      expect(items(res).map((v) => v.name)).toEqual(['Shawarma Hub Ikoyi']);
    });

    it('rejects invalid and unknown query params with problem+json', async () => {
      const bad = await http.get('/v1/vendors').query({ lat: 'abc', lng: 3 }).expect(400);
      expect(bad.headers['content-type']).toContain('application/problem+json');
      await http
        .get('/v1/vendors')
        .query({ ...VI, admin: 1 })
        .expect(400);
    });

    it('serves a live vendor with its menu and 404s for non-live vendors', async () => {
      const res = await http.get(`/v1/vendors/${seedVendorId(1)}`).expect(200);
      const body = res.body as {
        menu: { categories: { items: { price: Body; modifierGroups: Body[] }[] }[] };
      };
      const first = body.menu.categories[0]?.items[0];
      expect(first?.price).toEqual({ amountMinor: 250000, currency: 'NGN' });
      expect(first?.modifierGroups[0]).toMatchObject({
        name: 'Protein',
        minSelect: 0,
        maxSelect: 2,
      });
      await http.get(`/v1/vendors/${seedVendorId(8)}`).expect(404);
      await http.get('/v1/vendors/not-a-uuid').expect(400);
    });
  });

  describe('vendor menu management (RBAC + ownership)', () => {
    it('requires a valid bearer token', async () => {
      const item = await firstItemOf(1);
      await http
        .put(`/v1/vendors/${seedVendorId(1)}/items/${item}/availability`)
        .set('Idempotency-Key', idem())
        .send({ available: false })
        .expect(401);
      await http
        .put(`/v1/vendors/${seedVendorId(1)}/items/${item}/availability`)
        .set('Authorization', 'Bearer a.b.c')
        .set('Idempotency-Key', idem())
        .send({ available: false })
        .expect(401);
    });

    it('rejects callers without a vendor role', async () => {
      const item = await firstItemOf(1);
      const res = await http
        .put(`/v1/vendors/${seedVendorId(1)}/items/${item}/availability`)
        .set('Authorization', await token(customerA, ['customer']))
        .set('Idempotency-Key', idem())
        .send({ available: false })
        .expect(403);
      expect((res.body as Body).code).toBe('forbidden');
    });

    it('IDOR: vendor B cannot edit vendor A’s menu', async () => {
      const item = await firstItemOf(1);
      const auth = await token(ownerB, ['vendor_owner']);
      await http
        .patch(`/v1/vendors/${seedVendorId(1)}/items/${item}`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ name: 'Hijacked' })
        .expect(403);
      await http
        .put(`/v1/vendors/${seedVendorId(1)}/items/${item}/availability`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ available: false })
        .expect(403);
    });

    it('IDOR: vendor B cannot reach vendor A’s item through its own vendor path', async () => {
      const item = await firstItemOf(1);
      const auth = await token(ownerB, ['vendor_owner']);
      await http
        .patch(`/v1/vendors/${seedVendorId(7)}/items/${item}`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ name: 'Hijacked' })
        .expect(404);
      await http
        .put(`/v1/vendors/${seedVendorId(7)}/branches/${seedBranchId(1)}/opening-hours`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ hours: [] })
        .expect(404);
      const { rows } = await pool.query<{ name: string }>(
        'SELECT name FROM menu_items WHERE id = $1',
        [item],
      );
      expect(rows[0]?.name).not.toBe('Hijacked');
    });

    it('lets staff toggle availability (emitting an outbox event) but not edit items', async () => {
      const item = await firstItemOf(1);
      const auth = await token(staffA, ['vendor_staff']);
      const res = await http
        .put(`/v1/vendors/${seedVendorId(1)}/items/${item}/availability`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ available: false })
        .expect(200);
      expect((res.body as Body).available).toBe(false);
      const { rows } = await pool.query<{ payload: Body }>(
        "SELECT payload FROM outbox_events WHERE type = 'catalog.item.availability_changed'",
      );
      expect(rows.map((r) => r.payload)).toContainEqual({
        vendorId: seedVendorId(1),
        itemId: item,
        optionId: null,
        available: false,
      });
      await http
        .patch(`/v1/vendors/${seedVendorId(1)}/items/${item}`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ name: 'Staff edit' })
        .expect(403);
    });

    it('lets the owner add an item with a modifier group and set overnight hours', async () => {
      const auth = await token(DEMO_OWNER.id, ['customer', 'vendor_owner']);
      const { rows } = await pool.query<{ id: string }>(
        'SELECT id FROM menu_categories WHERE vendor_id = $1 LIMIT 1',
        [seedVendorId(1)],
      );
      const created = await http
        .post(`/v1/vendors/${seedVendorId(1)}/items`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({
          categoryId: rows[0]?.id,
          name: 'Ofada stew special',
          price: { amountMinor: 420000, currency: 'NGN' },
        })
        .expect(201);
      const itemId = (created.body as Body).id as string;
      const group = await http
        .post(`/v1/vendors/${seedVendorId(1)}/items/${itemId}/modifier-groups`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({
          name: 'Size',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Regular', priceDelta: { amountMinor: 0, currency: 'NGN' } },
            { name: 'Large', priceDelta: { amountMinor: 100000, currency: 'NGN' } },
          ],
        })
        .expect(201);
      const optionId = ((group.body as { options: Body[] }).options[1]?.id ?? '') as string;
      await http
        .put(`/v1/vendors/${seedVendorId(1)}/modifier-options/${optionId}/availability`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ available: false })
        .expect(200);
      await http
        .put(`/v1/vendors/${seedVendorId(1)}/branches/${seedBranchId(1)}/opening-hours`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ hours: [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }] })
        .expect(200);
      await http
        .post(`/v1/vendors/${seedVendorId(1)}/items`)
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({
          categoryId: rows[0]?.id,
          name: 'Float',
          price: { amountMinor: 10.5, currency: 'NGN' },
        })
        .expect(400);
    });

    it('lets ops approve an in-review vendor and emits catalog.vendor.went_live', async () => {
      await http
        .post(`/v1/vendors/${seedVendorId(8)}/go-live`)
        .set('Authorization', await token(DEMO_OWNER.id, ['vendor_owner']))
        .set('Idempotency-Key', idem())
        .expect(403);
      const res = await http
        .post(`/v1/vendors/${seedVendorId(8)}/go-live`)
        .set('Authorization', await token(opsUser, ['ops']))
        .set('Idempotency-Key', idem())
        .expect(200);
      expect((res.body as Body).status).toBe('live');
      const { rows } = await pool.query<{ n: string }>(
        "SELECT count(*) AS n FROM outbox_events WHERE type = 'catalog.vendor.went_live'",
      );
      expect(rows[0]?.n).toBe('1');
      await http
        .post(`/v1/vendors/${seedVendorId(8)}/go-live`)
        .set('Authorization', await token(opsUser, ['ops']))
        .set('Idempotency-Key', idem())
        .expect(409);
    });
  });

  describe('addresses', () => {
    it('creates, lists, updates and deletes; another customer gets 404 (IDOR)', async () => {
      const a = await token(customerA, ['customer']);
      const b = await token(customerB, ['customer']);
      const created = await http
        .post('/v1/addresses')
        .set('Authorization', a)
        .set('Idempotency-Key', idem())
        .send({ label: 'Home', line1: '5 Adeola Odeku St, VI', landmark: 'Near the bank', ...VI })
        .expect(201);
      const id = (created.body as Body).id as string;
      expect(created.body).toMatchObject({ lat: VI.lat, lng: VI.lng, landmark: 'Near the bank' });
      expect(
        items(await http.get('/v1/addresses').set('Authorization', a).expect(200)),
      ).toHaveLength(1);
      expect(
        items(await http.get('/v1/addresses').set('Authorization', b).expect(200)),
      ).toHaveLength(0);
      await http
        .patch(`/v1/addresses/${id}`)
        .set('Authorization', b)
        .set('Idempotency-Key', idem())
        .send({ label: 'Mine' })
        .expect(404);
      await http
        .delete(`/v1/addresses/${id}`)
        .set('Authorization', b)
        .set('Idempotency-Key', idem())
        .expect(404);
      const moved = await http
        .patch(`/v1/addresses/${id}`)
        .set('Authorization', a)
        .set('Idempotency-Key', idem())
        .send({ label: 'Office', ...IKOYI })
        .expect(200);
      expect(moved.body).toMatchObject({ label: 'Office', lat: IKOYI.lat, lng: IKOYI.lng });
      await http
        .delete(`/v1/addresses/${id}`)
        .set('Authorization', a)
        .set('Idempotency-Key', idem())
        .expect(204);
      await http.get('/v1/addresses').expect(401);
    });
  });
});
