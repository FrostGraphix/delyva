import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import type {
  ClientToServerEvents,
  DispatchOffer,
  Role,
  ServerToClientEvents,
} from '@delyva/contracts';
import { Redis } from 'ioredis';
import pg from 'pg';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { createApp } from '../src/create-app.js';
import { DISPATCH_SCHEDULER } from '../src/modules/dispatch/application/ports.js';
import type { BullMqDispatchScheduler } from '../src/modules/dispatch/infrastructure/bullmq-dispatch.queue.js';
import { InMemoryOrderFulfilment } from '../src/modules/dispatch/infrastructure/in-memory-order-fulfilment.temp.js';
import { OutboxDispatchConsumer } from '../src/modules/dispatch/infrastructure/outbox-dispatch.consumer.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Dispatch integration tests against real Postgres (`delyva_dispatch_test`) and Redis (db 4):
 * outbox consumer → BullMQ start job → offer over the rider socket → timeout → next rider,
 * Redis lock under concurrent accepts, GPS rejection, IDOR, idempotent offline replays,
 * escalation. SKIP with a message when the services are unreachable.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_NAME = 'delyva_dispatch_test';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
const REDIS_URL = process.env.TEST_DISPATCH_REDIS_URL ?? 'redis://127.0.0.1:56379/4';
const OFFER_TIMEOUT_MS = 1_500;

async function servicesAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2_000 });
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
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
  process.stderr.write('\n[SKIP] dispatch integration tests: Postgres/Redis not reachable.\n\n');
}

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PICKUP = { lat: 6.4281, lng: 3.4219 };
const DROPOFF = { lat: 6.4355, lng: 3.4567 };
const near = (m: number) => ({ lat: PICKUP.lat + m / 111_000, lng: PICKUP.lng });

describe.skipIf(!available)('dispatch (integration: Postgres + Redis + BullMQ + Socket.IO)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let pool: pg.Pool;
  let url = '';
  let signer: JoseAccessTokenSigner;
  let consumer: OutboxDispatchConsumer;
  const port = new InMemoryOrderFulfilment();
  const sockets: Client[] = [];
  let seq = 0;
  const key = () => `itest-key-${String(++seq).padStart(4, '0')}-${randomUUID().slice(0, 8)}`;
  const token = async (userId: string, roles: Role[]) =>
    (await signer.sign({ userId, roles, deviceId: 'device-dispatch-01' })).token;

  /** Creates a rider who is online at a position. */
  /** Takes every idle rider from earlier tests offline so candidates are deterministic. */
  const resetRiders = () =>
    pool.query(`UPDATE rider_profiles SET status = 'offline' WHERE status = 'online'`);

  async function onlineRider(pos: { lat: number; lng: number }) {
    const id = randomUUID();
    const auth = `Bearer ${await token(id, ['rider'])}`;
    await http
      .post('/v1/riders/me/online')
      .set('authorization', auth)
      .set('Idempotency-Key', key())
      .send({ batteryPct: 82 })
      .expect(200);
    await locate(auth, pos);
    return { id, auth };
  }
  const locate = (auth: string, pos: { lat: number; lng: number }) =>
    http
      .post('/v1/riders/me/locations')
      .set('authorization', auth)
      .send({ points: [{ ...pos, ts: Date.now() }] })
      .expect(202);

  /** Emits `ordering.order.vendor_accepted` into the outbox and runs the consumer once. */
  async function vendorAccepted(orderId = randomUUID()) {
    const payload = {
      orderId,
      branchId: randomUUID(),
      pickup: PICKUP,
      dropoff: DROPOFF,
      prepMinutes: 0,
      readyAt: new Date().toISOString(),
    };
    await pool.query(
      `INSERT INTO outbox_events (id, type, aggregate_type, aggregate_id, payload) VALUES ($1, 'ordering.order.vendor_accepted', 'order', $2, $3)`,
      [randomUUID(), orderId, JSON.stringify(payload)],
    );
    expect(await consumer.consumeBatch()).toBeGreaterThanOrEqual(1);
    return orderId;
  }

  async function waitFor<T>(fn: () => Promise<T | null | undefined>, ms = 8_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('timed out waiting');
      await sleep(50);
    }
  }
  const pendingOffer = (orderId: string) =>
    waitFor(
      async () =>
        (
          await pool.query<{ id: string; rider_id: string }>(
            `SELECT id, rider_id FROM dispatch_offers WHERE order_id = $1 AND status = 'pending'`,
            [orderId],
          )
        ).rows[0],
    );

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    const redis = new Redis(REDIS_URL);
    await redis.flushdb(); // db 4 belongs to this suite only
    redis.disconnect();
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
      BULLMQ_PREFIX: 'test-dispatch',
      NOTIFICATIONS_CONSUMER_ENABLED: 'false',
      DISPATCH_CONSUMER_ENABLED: 'false',
      DISPATCH_OFFER_TIMEOUT_MS: String(OFFER_TIMEOUT_MS),
      DISPATCH_RADII_M: '1000,3000',
      DISPATCH_DECLINES_BEFORE_WIDEN: '2',
      DISPATCH_MAX_OFFERS: '6',
      DISPATCH_GPS_MAX_DISTANCE_M: '200',
    });
    ({ app } = await createApp(env, { orderFulfilment: port }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${String((app.getHttpServer() as { address(): AddressInfo }).address().port)}`;
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
    signer = app.get(JoseAccessTokenSigner);
    consumer = app.get(OutboxDispatchConsumer);
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app.get<BullMqDispatchScheduler>(DISPATCH_SCHEDULER).raw.obliterate({ force: true });
    await app.close();
    await pool.end();
  });

  it('vendor_accepted → offer over the rider socket → accept → trip actions → delivered', async () => {
    const r = await onlineRider(near(150));
    const socket: Client = io(url, {
      auth: { token: r.auth.slice(7) },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((res, rej) => {
      socket.on('connect', () => {
        res();
      });
      socket.on('connect_error', rej);
    });
    const received = new Promise<DispatchOffer>((res) => {
      socket.on('dispatch:offer', res);
    });
    const orderId = await vendorAccepted();
    port.setCodes(orderId, { pickupCode: '4321', deliveryOtp: '123456' });
    const offer = await received;
    expect(offer).toMatchObject({ orderId, status: 'pending', pickup: PICKUP });

    const trip = await http
      .post(`/v1/dispatch-offers/${offer.id}/accept`)
      .set('authorization', r.auth)
      .set('Idempotency-Key', key())
      .expect(200);
    const tripId = (trip.body as { id: string }).id;
    const cur = await http
      .get('/v1/riders/me/trips/current')
      .set('authorization', r.auth)
      .expect(200);
    expect((cur.body as { trip: { id: string } }).trip.id).toBe(tripId);

    const act = (path: string, body: object) =>
      http
        .post(`/v1/trips/${tripId}/${path}`)
        .set('authorization', r.auth)
        .set('Idempotency-Key', key())
        .send(body);
    // GPS sanity: 150 m away is within 200 m; move away to be rejected first
    await locate(r.auth, near(900));
    const far = await act('arrived-at-vendor', { pickupCode: '4321' }).expect(422);
    expect(far.headers['content-type']).toContain('application/problem+json');
    expect((far.body as { code: string }).code).toBe('rider_too_far');
    await sleep(5);
    await locate(r.auth, PICKUP);
    await act('arrived-at-vendor', { pickupCode: '4321' }).expect(200);
    await act('picked-up', {}).expect(200);
    await sleep(5);
    await locate(r.auth, DROPOFF);
    await act('arrived-at-customer', {}).expect(200);
    const done = await act('delivered', { deliveryOtp: '123456' }).expect(200);
    expect((done.body as { status: string }).status).toBe('delivered');
    expect(port.stageOf(orderId)).toBe('DELIVERED');
    const me = await http.get('/v1/riders/me').set('authorization', r.auth).expect(200);
    expect(me.body).toMatchObject({ status: 'online', stats: { offersAccepted: 1 } });
    const events = await pool.query<{ type: string }>(
      `SELECT type FROM outbox_events WHERE aggregate_id IN ($1, $2) ORDER BY occurred_at`,
      [offer.id, orderId],
    );
    expect(events.rows.map((e) => e.type)).toEqual(
      expect.arrayContaining(['dispatch.offer.sent', 'dispatch.offer.accepted']),
    );
  });

  it('offers one rider at a time and moves to the next after the timeout', async () => {
    await resetRiders();
    const a = await onlineRider(near(100));
    const b = await onlineRider(near(400));
    const orderId = await vendorAccepted();
    const first = await pendingOffer(orderId);
    expect(first.rider_id).toBe(a.id);
    const count = await pool.query(
      `SELECT count(*)::int AS n FROM dispatch_offers WHERE order_id = $1`,
      [orderId],
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
    const second = await waitFor(async () => {
      const o = await pendingOffer(orderId);
      return o.id === first.id ? null : o;
    }, OFFER_TIMEOUT_MS + 6_000);
    expect(second.rider_id).toBe(b.id);
    const expired = await pool.query<{ status: string }>(
      `SELECT status FROM dispatch_offers WHERE id = $1`,
      [first.id],
    );
    expect(expired.rows[0]?.status).toBe('expired');
    // cleanup: decline so riders are free for later tests
    await http
      .post(`/v1/dispatch-offers/${second.id}/decline`)
      .set('authorization', b.auth)
      .set('Idempotency-Key', key())
      .expect(200);
    await http
      .post('/v1/riders/me/offline')
      .set('authorization', a.auth)
      .set('Idempotency-Key', key())
      .send({ batteryPct: 50 })
      .expect(200);
    await http
      .post('/v1/riders/me/offline')
      .set('authorization', b.auth)
      .set('Idempotency-Key', key())
      .send({ batteryPct: 50 })
      .expect(200);
  });

  it('the order lock prevents double assignment under concurrent accepts and ops override', async () => {
    await resetRiders();
    const a = await onlineRider(near(50));
    const b = await onlineRider(near(2_500));
    const orderId = await vendorAccepted();
    const offer = await pendingOffer(orderId);
    const opsAuth = `Bearer ${await token(randomUUID(), ['ops'])}`;
    const results = await Promise.all([
      http
        .post(`/v1/dispatch-offers/${offer.id}/accept`)
        .set('authorization', a.auth)
        .set('Idempotency-Key', key()),
      http
        .post(`/v1/dispatch-offers/${offer.id}/accept`)
        .set('authorization', a.auth)
        .set('Idempotency-Key', key()),
      http
        .post(`/v1/admin/dispatch/orders/${orderId}/assign`)
        .set('authorization', opsAuth)
        .set('Idempotency-Key', key())
        .send({ riderId: b.id, reason: 'concurrency test override' }),
    ]);
    const trips = await pool.query<{ rider_id: string }>(
      `SELECT rider_id FROM trips WHERE order_id = $1`,
      [orderId],
    );
    expect(trips.rows).toHaveLength(1);
    const winner = trips.rows[0]?.rider_id;
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((x) => x.status !== 200)) {
      expect(['offer_unavailable', 'order_already_assigned', 'conflict']).toContain(
        (r.body as { code: string }).code,
      );
    }
    expect(
      port.calls.filter((c) => c.orderId === orderId && c.method === 'markRiderAssigned'),
    ).toEqual([{ method: 'markRiderAssigned', orderId, riderId: winner }]);
  });

  it('IDOR: rider B cannot act on rider A’s offer or trip; non-riders are forbidden', async () => {
    await resetRiders();
    const a = await onlineRider(near(30));
    const b = await onlineRider(near(2_900));
    const orderId = await vendorAccepted();
    const offer = await pendingOffer(orderId);
    expect(offer.rider_id).toBe(a.id);
    await http
      .post(`/v1/dispatch-offers/${offer.id}/accept`)
      .set('authorization', b.auth)
      .set('Idempotency-Key', key())
      .expect(404);
    const trip = await http
      .post(`/v1/dispatch-offers/${offer.id}/accept`)
      .set('authorization', a.auth)
      .set('Idempotency-Key', key())
      .expect(200);
    const tripId = (trip.body as { id: string }).id;
    await http
      .post(`/v1/trips/${tripId}/picked-up`)
      .set('authorization', b.auth)
      .set('Idempotency-Key', key())
      .send({})
      .expect(404);
    const customer = `Bearer ${await token(randomUUID(), ['customer'])}`;
    await http.get('/v1/riders/me').set('authorization', customer).expect(403);
    await http.get('/v1/admin/dispatch/riders').set('authorization', a.auth).expect(403);
    await http
      .post(`/v1/admin/dispatch/orders/${orderId}/assign`)
      .set('authorization', `Bearer ${await token(randomUUID(), ['ops'])}`)
      .set('Idempotency-Key', key())
      .send({ riderId: b.id })
      .expect(400);

    // offline replay: same Idempotency-Key returns the stored response without calling ordering again
    await locate(a.auth, PICKUP);
    const replayKey = key();
    const first = await http
      .post(`/v1/trips/${tripId}/arrived-at-vendor`)
      .set('authorization', a.auth)
      .set('Idempotency-Key', replayKey)
      .send({ pickupCode: '1111' })
      .expect(200);
    const again = await http
      .post(`/v1/trips/${tripId}/arrived-at-vendor`)
      .set('authorization', a.auth)
      .set('Idempotency-Key', replayKey)
      .send({ pickupCode: '1111' })
      .expect(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    // a replay queued under a different key after the rider moved on is also accepted (already applied)
    await sleep(5);
    await locate(a.auth, near(5_000));
    await http
      .post(`/v1/trips/${tripId}/arrived-at-vendor`)
      .set('authorization', a.auth)
      .set('Idempotency-Key', key())
      .send({ pickupCode: '1111' })
      .expect(200);
    expect(
      port.calls.filter((c) => c.orderId === orderId && c.method === 'markRiderAtVendor'),
    ).toHaveLength(1);

    const list = await http
      .get('/v1/admin/dispatch/riders')
      .set('authorization', `Bearer ${await token(randomUUID(), ['ops'])}`)
      .expect(200);
    expect(
      (list.body as { items: { riderId: string; activeOrderId: string | null }[] }).items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ riderId: a.id, activeOrderId: orderId })]),
    );
  });

  it('widens the radius after declines and escalates to ops when nobody is left', async () => {
    await resetRiders();
    // riders from earlier tests are on trips or offline; this order only has riders 2.5 km out
    const c = await onlineRider(near(2_600));
    const orderId = await vendorAccepted();
    const offer = await pendingOffer(orderId);
    expect(offer.rider_id).toBe(c.id);
    const radius = await pool.query<{ radius_m: number }>(
      `SELECT radius_m FROM dispatch_offers WHERE id = $1`,
      [offer.id],
    );
    expect(radius.rows[0]?.radius_m).toBe(3_000);
    await http
      .post(`/v1/dispatch-offers/${offer.id}/decline`)
      .set('authorization', c.auth)
      .set('Idempotency-Key', key())
      .expect(200);
    const req = await waitFor(
      async () =>
        (
          await pool.query<{ status: string }>(
            `SELECT status FROM dispatch_requests WHERE order_id = $1 AND status = 'unassigned'`,
            [orderId],
          )
        ).rows[0],
    );
    expect(req.status).toBe('unassigned');
    const ev = await pool.query(
      `SELECT payload FROM outbox_events WHERE type = 'dispatch.order.unassigned' AND aggregate_id = $1`,
      [orderId],
    );
    expect(ev.rows).toHaveLength(1);
  });
});
