import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { createApp } from '../src/create-app.js';
import { devOtpKey } from '../src/modules/identity/infrastructure/sms.senders.js';
import { loadEnv } from '../src/shared/config/env.js';
import { OutboxPublisher } from '../src/shared/outbox/outbox.publisher.js';

/**
 * Integration tests against the real Postgres+PostGIS and Redis from infra/docker-compose.yml.
 * They SKIP (with a message) when those services are unreachable; they never fake-pass.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, '/delyva_test');
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15';

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
    '\n[SKIP] auth integration tests: Postgres/Redis from infra/docker-compose.yml are not reachable. Run `docker compose -f infra/docker-compose.yml up -d`.\n\n',
  );
}

/** Typed view of a JSON response body. */
const b = (r: request.Response): Record<string, string> => r.body as Record<string, string>;

const phone = '+2348031234567';
const deviceId = 'device-integration-1';

describe.skipIf(!available)('auth API (integration: Postgres + Redis)', () => {
  let app: INestApplication;
  let redis: Redis;
  let pool: pg.Pool;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('DROP DATABASE IF EXISTS delyva_test WITH (FORCE)');
    await admin.query('CREATE DATABASE delyva_test');
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
    });
    ({ app } = await createApp(env));
    await app.init();
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    redis.disconnect();
  });

  const requestOtp = (key: string, body: object = { phone }) =>
    http.post('/v1/auth/otp/request').set('Idempotency-Key', key).send(body);

  const otpFor = async (p: string): Promise<string> => {
    const code = await redis.get(devOtpKey(p));
    if (!code) throw new Error('no dev OTP stored');
    return code;
  };

  it('serves healthz and readyz with Postgres and Redis up', async () => {
    await http.get('/healthz').expect(200, { status: 'ok' });
    const ready = await http.get('/readyz').expect(200);
    expect(ready.body).toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('requires an Idempotency-Key and answers with problem+json', async () => {
    const res = await http.post('/v1/auth/otp/request').send({ phone }).expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 400, code: 'idempotency_key_required' });
  });

  it('rejects invalid phones and unknown fields', async () => {
    const res = await requestOtp('key-invalid-1', { phone: '0803', extra: true }).expect(400);
    expect(b(res).code).toBe('validation_failed');
  });

  it('sends an OTP, replays on the same key, and conflicts on a different body', async () => {
    const first = await requestOtp('key-request-0001').expect(202);
    expect(first.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    const replay = await requestOtp('key-request-0001').expect(202);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const conflict = await requestOtp('key-request-0001', { phone: '+2348039999999' }).expect(409);
    expect(b(conflict).code).toBe('idempotency_key_conflict');
  });

  it('stores the OTP only as a hash', async () => {
    const code = await otpFor(phone);
    const { rows } = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM otp_challenges',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it('rate limits resends within the cooldown', async () => {
    const res = await requestOtp('key-request-0002').expect(429);
    expect(b(res).code).toBe('rate_limited');
  });

  let refreshToken = '';

  it('rejects a wrong code, then verifies the right one and issues an EdDSA JWT', async () => {
    const wrong = await http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: '000000', deviceId })
      .expect(401);
    expect(b(wrong).code).toBe('otp_invalid');
    const code = await otpFor(phone);
    const res = await http.post('/v1/auth/otp/verify').send({ phone, code, deviceId }).expect(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', accessTokenExpiresIn: 900 });
    const jwks = await http.get('/.well-known/jwks.json').expect(200);
    const { payload, protectedHeader } = await jwtVerify(
      b(res).accessToken ?? '',
      createLocalJWKSet(jwks.body as JSONWebKeySet),
      {
        issuer: 'https://api.delyva.test',
        audience: 'delyva-apps',
      },
    );
    expect(protectedHeader.alg).toBe('EdDSA');
    expect(payload.sub).toBe(b(res).userId);
    refreshToken = b(res).refreshToken ?? '';
  });

  it('wrote identity.user.registered to the outbox and publishes it', async () => {
    const { rows } = await pool.query<{ type: string }>(
      'SELECT type FROM outbox_events WHERE published_at IS NULL',
    );
    expect(rows.map((r) => r.type)).toContain('identity.user.registered');
    expect(await app.get(OutboxPublisher).publishBatch()).toBeGreaterThan(0);
  });

  it('rotates the refresh token and revokes the family on reuse', async () => {
    const rotated = await http
      .post('/v1/auth/refresh')
      .send({ refreshToken, deviceId })
      .expect(200);
    const next = b(rotated).refreshToken ?? '';
    expect(next).not.toBe(refreshToken);
    const reuse = await http.post('/v1/auth/refresh').send({ refreshToken, deviceId }).expect(401);
    expect(b(reuse).code).toBe('refresh_token_reused');
    const revoked = await http
      .post('/v1/auth/refresh')
      .send({ refreshToken: next, deviceId })
      .expect(401);
    expect(b(revoked).code).toBe('refresh_token_reused');
  });

  it('locks the OTP after 5 wrong attempts', async () => {
    const other = '+2348051112222';
    await requestOtp('key-request-lock-1', { phone: other }).expect(202);
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await http
        .post('/v1/auth/otp/verify')
        .send({ phone: other, code: '999999', deviceId });
      codes.push(b(res).code ?? '');
    }
    expect(codes.at(-1)).toBe('otp_attempts_exceeded');
    const right = await otpFor(other);
    const final = await http
      .post('/v1/auth/otp/verify')
      .send({ phone: other, code: right, deviceId })
      .expect(429);
    expect(b(final).code).toBe('otp_attempts_exceeded');
  });

  it('logs out with 204', async () => {
    await http
      .post('/v1/auth/logout')
      .send({ refreshToken: 'x'.repeat(43) })
      .expect(204);
  });
});
