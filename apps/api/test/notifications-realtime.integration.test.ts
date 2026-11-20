import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import type {
  ClientToServerEvents,
  RiderLocationBroadcast,
  Role,
  ServerToClientEvents,
  SocketAck,
} from '@delyva/contracts';
import { Redis } from 'ioredis';
import pg from 'pg';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { createApp } from '../src/create-app.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { devOtpKey } from '../src/modules/identity/infrastructure/sms.senders.js';
import { BullMqDeliveryQueue } from '../src/modules/notifications/infrastructure/bullmq-delivery.queue.js';
import { OutboxNotificationConsumer } from '../src/modules/notifications/infrastructure/outbox-notification.consumer.js';
import {
  LIVE_TRACKING,
  type LiveTrackingService,
} from '../src/modules/realtime/application/live-tracking.service.js';
import { InMemoryOrderRoomAuthorizer } from '../src/modules/realtime/infrastructure/order-room.authorizers.js';
import { RIDER_GEO_KEY } from '../src/modules/realtime/infrastructure/redis-location.store.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Integration tests for notifications + realtime against the real Postgres and Redis
 * (own database `delyva_notify_test`, Redis db 12). They SKIP with a message when unreachable.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_NAME = 'delyva_notify_test';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
const REDIS_URL = process.env.TEST_NOTIFY_API_REDIS_URL ?? 'redis://127.0.0.1:56379/12';
const PREFIX = 'test-notify-api';

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
  process.stderr.write(
    '\n[SKIP] notifications/realtime integration tests: Postgres/Redis not reachable.\n\n',
  );
}

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const body = (r: request.Response): Record<string, unknown> => r.body as Record<string, unknown>;

describe.skipIf(!available)('notifications + realtime (integration: Postgres + Redis)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let redis: Redis;
  let pool: pg.Pool;
  let url = '';
  let signer: JoseAccessTokenSigner;
  const authorizer = new InMemoryOrderRoomAuthorizer();
  const sockets: Client[] = [];

  const token = async (userId: string, roles: Role[], deviceId = 'device-test-0001') =>
    (await signer.sign({ userId, roles, deviceId })).token;

  const connect = (auth: object): Promise<Client> =>
    new Promise((resolve, reject) => {
      const s: Client = io(url, { auth, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      s.on('connect', () => {
        resolve(s);
      });
      s.on('connect_error', (err) => {
        reject(err);
      });
    });

  const emit = (
    s: Client,
    event: 'rider:location' | 'order:join',
    payload: unknown,
  ): Promise<SocketAck> =>
    new Promise((resolve) => {
      (s.emit as (e: string, p: unknown, ack: (r: SocketAck) => void) => void)(
        event,
        payload,
        resolve,
      );
    });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
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
      BULLMQ_PREFIX: PREFIX,
      NOTIFICATIONS_CONSUMER_ENABLED: 'false',
    });
    ({ app } = await createApp(env, { orderRoomAuthorizer: authorizer }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${String((app.getHttpServer() as { address(): AddressInfo }).address().port)}`;
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
    signer = app.get(JoseAccessTokenSigner);
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app.get(BullMqDeliveryQueue).raw.obliterate({ force: true });
    await app.close();
    await pool.end();
    redis.disconnect();
  });

  describe('devices, inbox and preferences', () => {
    const phone = '+2348031230001';
    const deviceId = 'device-notify-0001';
    let access = '';
    let userId = '';

    it('requires a bearer token', async () => {
      const res = await http.get('/v1/notifications').expect(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      await http.get('/v1/notifications').set('authorization', 'Bearer not.a.jwt').expect(401);
    });

    it('registers a push token bound to the device id from the token (body cannot spoof it)', async () => {
      await http
        .post('/v1/auth/otp/request')
        .set('Idempotency-Key', 'notify-otp-0001')
        .send({ phone })
        .expect(202);
      const code = (await redis.get(devOtpKey(phone))) ?? '';
      const verified = await http
        .post('/v1/auth/otp/verify')
        .send({ phone, code, deviceId })
        .expect(200);
      access = String(body(verified).accessToken);
      userId = String(body(verified).userId);
      const pushToken = 'ExponentPushToken[integration-0001]';
      await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${access}`)
        .send({ pushToken, platform: 'android', deviceId: 'spoof' })
        .expect(400);
      const res = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${access}`)
        .send({ pushToken, platform: 'android' })
        .expect(200);
      expect(res.body).toMatchObject({ deviceId, platform: 'android', locale: 'en' });
      const { rows } = await pool.query('SELECT user_id, device_id FROM push_devices');
      expect(rows).toEqual([{ user_id: userId, device_id: deviceId }]);
    });

    it('consumes identity.user.registered from the outbox into the inbox and a push job', async () => {
      const consumer = app.get(OutboxNotificationConsumer);
      expect(await consumer.consumeBatch()).toBe(1);
      expect(await consumer.consumeBatch()).toBe(0);
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id FROM outbox_events WHERE type = 'identity.user.registered'",
      );
      const eventId = rows[0]?.id ?? '';
      const job = await app.get(BullMqDeliveryQueue).raw.getJob(`${eventId}_${userId}_push`);
      expect(job?.data).toMatchObject({
        kind: 'push',
        tokens: ['ExponentPushToken[integration-0001]'],
      });
      expect(job?.opts.attempts).toBe(5);
    });

    it('lists the inbox and marks an item read; other users get 404 (no IDOR)', async () => {
      const list = await http
        .get('/v1/notifications')
        .set('authorization', `Bearer ${access}`)
        .expect(200);
      const page = body(list) as { items: { id: string; title: string }[]; unreadCount: number };
      expect(page.items.map((i) => i.title)).toEqual(['Welcome to Delyva']);
      expect(page.unreadCount).toBe(1);
      const id = page.items[0]?.id ?? '';
      const other = await token(randomUUID(), ['customer']);
      await http
        .post(`/v1/notifications/${id}/read`)
        .set('authorization', `Bearer ${other}`)
        .expect(404);
      await http
        .post('/v1/notifications/not-a-uuid/read')
        .set('authorization', `Bearer ${access}`)
        .expect(400);
      await http
        .post(`/v1/notifications/${id}/read`)
        .set('authorization', `Bearer ${access}`)
        .expect(204);
      const unread = await http
        .get('/v1/notifications?unreadOnly=true')
        .set('authorization', `Bearer ${access}`)
        .expect(200);
      expect(body(unread)).toMatchObject({ items: [], unreadCount: 0, nextCursor: null });
    });

    it('reads and updates preferences', async () => {
      const res = await http
        .put('/v1/notifications/preferences')
        .set('authorization', `Bearer ${access}`)
        .send({ preferences: [{ category: 'promotions', channel: 'push', enabled: true }] })
        .expect(200);
      expect((body(res).preferences as unknown[]).length).toBe(12);
      const got = await http
        .get('/v1/notifications/preferences')
        .set('authorization', `Bearer ${access}`)
        .expect(200);
      expect(body(got).preferences).toContainEqual({
        category: 'promotions',
        channel: 'push',
        enabled: true,
      });
    });
  });

  describe('socket gateway', () => {
    const riderId = randomUUID();
    const customerId = randomUUID();
    const strangerId = randomUUID();
    const orderId = randomUUID();

    it('rejects connections with a missing or invalid JWT', async () => {
      await expect(connect({})).rejects.toThrow('unauthorized');
      await expect(connect({ token: 'garbage' })).rejects.toThrow('unauthorized');
      const wrongKey = new JoseAccessTokenSigner({
        privateKeyPemB64: '',
        keyId: 'dev-1',
        issuer: 'https://api.delyva.test',
        audience: 'delyva-apps',
      });
      const forged = (
        await wrongKey.sign({ userId: riderId, roles: ['rider'], deviceId: 'd-forged-1' })
      ).token;
      await expect(connect({ token: forged })).rejects.toThrow('unauthorized');
    });

    it('denies order rooms to non-participants and allows participants and ops', async () => {
      authorizer.allow(orderId, customerId);
      const stranger = await connect({ token: await token(strangerId, ['customer']) });
      expect(await emit(stranger, 'order:join', { orderId })).toEqual({
        ok: false,
        code: 'forbidden',
      });
      const customer = await connect({ token: await token(customerId, ['customer']) });
      expect(await emit(customer, 'order:join', { orderId })).toEqual({ ok: true });
      const ops = await connect({ token: await token(randomUUID(), ['ops']) });
      expect(await emit(ops, 'order:join', { orderId })).toEqual({ ok: true });
      expect(await emit(customer, 'order:join', { orderId: 'nope' })).toEqual({
        ok: false,
        code: 'validation_failed',
      });
    });

    it('ingests a rider location, writes Redis GEO and fans out to the order room only', async () => {
      await app.get<symbol, LiveTrackingService>(LIVE_TRACKING).startTrip(riderId, orderId);
      const customer = await connect({ token: await token(customerId, ['customer']) });
      await emit(customer, 'order:join', { orderId });
      const stranger = await connect({ token: await token(strangerId, ['customer']) });
      const strangerGot: unknown[] = [];
      stranger.on('rider:location', (p) => strangerGot.push(p));
      const received = new Promise<RiderLocationBroadcast>((resolve) => {
        customer.once('rider:location', resolve);
      });
      const rider = await connect({ token: await token(riderId, ['rider']) });
      const ts = Date.now();
      expect(
        await emit(rider, 'rider:location', { lat: 6.4541, lng: 3.3947, heading: 90, ts }),
      ).toEqual({ ok: true });
      expect(await received).toEqual({
        riderId,
        orderId,
        lat: 6.4541,
        lng: 3.3947,
        heading: 90,
        ts,
      });
      const [pos] = await redis.geopos(RIDER_GEO_KEY, riderId);
      expect(Number(pos?.[0])).toBeCloseTo(3.3947, 3);
      expect(Number(pos?.[1])).toBeCloseTo(6.4541, 3);
      expect(strangerGot).toEqual([]);
    });

    it('validates location payloads and roles', async () => {
      const rider = await connect({ token: await token(randomUUID(), ['rider']) });
      expect(await emit(rider, 'rider:location', { lat: 200, lng: 3, ts: Date.now() })).toEqual({
        ok: false,
        code: 'validation_failed',
      });
      expect(
        await emit(rider, 'rider:location', { lat: 6, lng: 3, ts: Date.now() - 3_600_000 }),
      ).toEqual({
        ok: false,
        code: 'validation_failed',
      });
      const customer = await connect({ token: await token(randomUUID(), ['customer']) });
      expect(await emit(customer, 'rider:location', { lat: 6, lng: 3, ts: Date.now() })).toEqual({
        ok: false,
        code: 'forbidden',
      });
    });

    it('rate limits rider:location (5 per 10 s)', async () => {
      const rider = await connect({ token: await token(randomUUID(), ['rider']) });
      const acks: SocketAck[] = [];
      for (let i = 0; i < 6; i++) {
        acks.push(await emit(rider, 'rider:location', { lat: 6.5, lng: 3.4, ts: Date.now() + i }));
      }
      expect(acks.slice(0, 5).every((a) => a.ok)).toBe(true);
      expect(acks[5]).toEqual({ ok: false, code: 'rate_limited' });
    });
  });

  describe('HTTP location fallback', () => {
    it('accepts batched points from riders, rejects stale ones, and forbids non-riders', async () => {
      const riderId = randomUUID();
      const rider = await token(riderId, ['rider']);
      const now = Date.now();
      const res = await http
        .post('/v1/riders/me/locations')
        .set('authorization', `Bearer ${rider}`)
        .send({
          points: [
            { lat: 6.5, lng: 3.35, ts: now - 2_000 },
            { lat: 6.51, lng: 3.36, ts: now - 1_000 },
            { lat: 6.5, lng: 3.3, ts: now - 3_600_000 },
          ],
        })
        .expect(202);
      expect(res.body).toEqual({ accepted: 2, rejected: 1 });
      const [pos] = await redis.geopos(RIDER_GEO_KEY, riderId);
      expect(Number(pos?.[1])).toBeCloseTo(6.51, 3);
      const customer = await token(randomUUID(), ['customer']);
      await http
        .post('/v1/riders/me/locations')
        .set('authorization', `Bearer ${customer}`)
        .send({ points: [{ lat: 6.5, lng: 3.35, ts: now }] })
        .expect(403);
    });

    it('rate limits batches (12 per minute)', async () => {
      const rider = await token(randomUUID(), ['rider']);
      const statuses: number[] = [];
      for (let i = 0; i < 13; i++) {
        const r = await http
          .post('/v1/riders/me/locations')
          .set('authorization', `Bearer ${rider}`)
          .send({ points: [{ lat: 6.5, lng: 3.35, ts: Date.now() }] });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 12).every((s) => s === 202)).toBe(true);
      expect(statuses[12]).toBe(429);
    });
  });
});
