/**
 * Local demo (not shipped): boots the API against the local docker-compose services, obtains a
 * real access token through the OTP flow, registers a device, connects a rider socket, sends a
 * location and prints the Redis GEO write and the inbox.
 * Run: pnpm --filter @delyva/api build && node --env-file=.env dist/scripts/demo-realtime.js
 */
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import { io } from 'socket.io-client';
import { createApp } from '../src/create-app.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { devOtpKey } from '../src/modules/identity/infrastructure/sms.senders.js';
import { OutboxNotificationConsumer } from '../src/modules/notifications/infrastructure/outbox-notification.consumer.js';
import { RIDER_GEO_KEY } from '../src/modules/realtime/infrastructure/redis-location.store.js';
import { loadEnv } from '../src/shared/config/env.js';

const out = (label: string, value: unknown): void => {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
};

const env = loadEnv({ ...process.env, LOG_LEVEL: 'warn', NOTIFICATIONS_CONSUMER_ENABLED: 'false' });
const { app } = await createApp(env);
await app.listen(0, '127.0.0.1');
const base = `http://127.0.0.1:${String((app.getHttpServer() as { address(): AddressInfo }).address().port)}`;
const redis = new Redis(env.REDIS_URL);
const phone = `+234803${String(Date.now()).slice(-7)}`;
const deviceId = `demo-device-${String(Date.now())}`;
const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    body: r.status === 204 ? null : ((await r.json()) as Record<string, unknown>),
  };
};

await post('/v1/auth/otp/request', { phone }, { 'Idempotency-Key': `demo-${deviceId}` });
const code = (await redis.get(devOtpKey(phone))) ?? '';
const verified = await post('/v1/auth/otp/verify', { phone, code, deviceId });
const access = String(verified.body?.accessToken);
const userId = String(verified.body?.userId);
out('verify status', verified.status);
const auth = { authorization: `Bearer ${access}` };
out(
  'POST /v1/devices',
  await post(
    '/v1/devices',
    { pushToken: 'ExponentPushToken[demo-token-0001]', platform: 'android' },
    auth,
  ),
);
out('outbox events consumed', await app.get(OutboxNotificationConsumer).consumeBatch());
const inbox = await fetch(`${base}/v1/notifications`, { headers: auth });
out('GET /v1/notifications', { status: inbox.status, body: await inbox.json() });

// The OTP flow issues customer tokens; sign a rider token for the same user to demo ingestion.
const riderToken = (
  await app.get(JoseAccessTokenSigner).sign({ userId, roles: ['rider'], deviceId })
).token;
const socket = io(base, { auth: { token: riderToken }, transports: ['websocket'] });
await new Promise<void>((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
});
out('socket connected', socket.id);
const ack = await new Promise((resolve) => {
  socket.emit('rider:location', { lat: 6.4281, lng: 3.4219, heading: 45, ts: Date.now() }, resolve);
});
out('rider:location ack', ack);
out(`GEOPOS ${RIDER_GEO_KEY} ${userId}`, await redis.geopos(RIDER_GEO_KEY, userId));
const bad = io(base, {
  auth: { token: 'invalid' },
  transports: ['websocket'],
  reconnection: false,
});
out(
  'invalid token',
  await new Promise((resolve) =>
    bad.on('connect_error', (e) => {
      resolve(e.message);
    }),
  ),
);
socket.disconnect();
bad.disconnect();
redis.disconnect();
await app.close();
