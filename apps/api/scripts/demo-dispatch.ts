/**
 * Local dispatch demo (not shipped): boots the API on PORT against the local docker-compose
 * services (own DB + Redis db), puts a rider online with a location, emits
 * `ordering.order.vendor_accepted` into the outbox, waits for the offer on the rider socket,
 * accepts it and runs the trip actions against the TEMP in-memory ordering port.
 * Rider/ops access tokens are minted with the app's own signer (no rider onboarding exists yet).
 * Run: pnpm --filter @delyva/api build && node --env-file=.env.dispatch dist/scripts/demo-dispatch.js
 */
import { randomUUID } from 'node:crypto';
import type { DispatchOffer } from '@delyva/contracts';
import pg from 'pg';
import { io } from 'socket.io-client';
import { createApp } from '../src/create-app.js';
import { InMemoryOrderFulfilment } from '../src/modules/dispatch/infrastructure/in-memory-order-fulfilment.temp.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { loadEnv } from '../src/shared/config/env.js';

const out = (label: string, value: unknown): void => {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
};

const env = loadEnv({ ...process.env, LOG_LEVEL: 'warn', NOTIFICATIONS_CONSUMER_ENABLED: 'false' });
const port = new InMemoryOrderFulfilment();
const { app } = await createApp(env, { orderFulfilment: port });
await app.listen(env.PORT, '127.0.0.1');
const base = `http://127.0.0.1:${String(env.PORT)}`;
const signer = app.get(JoseAccessTokenSigner);
const riderId = randomUUID();
const rider = `Bearer ${(await signer.sign({ userId: riderId, roles: ['rider'], deviceId: 'demo-rider-device' })).token}`;
const ops = `Bearer ${(await signer.sign({ userId: randomUUID(), roles: ['ops'], deviceId: 'demo-ops-device' })).token}`;
const call = async (method: string, path: string, auth: string, body?: unknown) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: auth,
      'Idempotency-Key': `demo-${randomUUID()}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json() };
};

const PICKUP = { lat: 6.4281, lng: 3.4219 };
const DROPOFF = { lat: 6.4355, lng: 3.4567 };
out(
  'POST /v1/riders/me/online',
  await call('POST', '/v1/riders/me/online', rider, { batteryPct: 78 }),
);
out(
  'POST /v1/riders/me/locations',
  await call('POST', '/v1/riders/me/locations', rider, {
    points: [{ lat: 6.429, lng: 3.4219, ts: Date.now() }],
  }),
);

const socket = io(base, {
  auth: { token: rider.slice(7) },
  transports: ['websocket'],
  reconnection: false,
});
await new Promise<void>((res, rej) => {
  socket.on('connect', () => {
    res();
  });
  socket.on('connect_error', rej);
});
out('rider socket connected', socket.id);
const offerP = new Promise<DispatchOffer>((res) => {
  socket.on('dispatch:offer', res);
});

const orderId = randomUUID();
port.setCodes(orderId, { pickupCode: '4821', deliveryOtp: '305117' });
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
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
out('simulated outbox event ordering.order.vendor_accepted', payload);
const offer = await offerP;
out('socket dispatch:offer received', offer);

const trip = await call('POST', `/v1/dispatch-offers/${offer.id}/accept`, rider);
out('POST accept', trip);
const tripId = (trip.body as { id: string }).id;
out('GET /v1/admin/dispatch/riders (ops)', await call('GET', '/v1/admin/dispatch/riders', ops));
await call('POST', '/v1/riders/me/locations', rider, {
  points: [{ lat: 6.45, lng: 3.42, ts: Date.now() }],
});
out(
  'arrived-at-vendor while ~2.4 km from pickup (GPS check)',
  await call('POST', `/v1/trips/${tripId}/arrived-at-vendor`, rider, {
    pickupCode: '4821',
  }),
);
await call('POST', '/v1/riders/me/locations', rider, { points: [{ ...PICKUP, ts: Date.now() }] });
out(
  'arrived-at-vendor',
  await call('POST', `/v1/trips/${tripId}/arrived-at-vendor`, rider, { pickupCode: '4821' }),
);
out('picked-up', await call('POST', `/v1/trips/${tripId}/picked-up`, rider, {}));
await call('POST', '/v1/riders/me/locations', rider, { points: [{ ...DROPOFF, ts: Date.now() }] });
out(
  'arrived-at-customer',
  await call('POST', `/v1/trips/${tripId}/arrived-at-customer`, rider, {}),
);
out(
  'delivered',
  await call('POST', `/v1/trips/${tripId}/delivered`, rider, { deliveryOtp: '305117' }),
);
out('in-memory ordering port calls', port.calls);
out('GET /v1/riders/me', await call('GET', '/v1/riders/me', rider));
const events = await pool.query<{ type: string }>(
  `SELECT type FROM outbox_events WHERE type LIKE 'dispatch.%' AND (aggregate_id = $1 OR aggregate_id = $2) ORDER BY occurred_at`,
  [orderId, offer.id],
);
out(
  'dispatch outbox events',
  events.rows.map((r) => r.type),
);

socket.disconnect();
await pool.end();
await app.close();
