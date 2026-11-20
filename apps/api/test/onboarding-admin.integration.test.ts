import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { decodeJwt } from 'jose';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { seedCatalog } from '../scripts/seed-catalog.js';
import { createApp } from '../src/create-app.js';
import { base32Decode, hotp, totpStep } from '../src/modules/admin/domain/totp.js';
import { RIDER_QUIZ } from '../src/modules/onboarding/domain/quiz.js';
import { devOtpKey } from '../src/modules/identity/infrastructure/sms.senders.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Onboarding + admin integration tests against real Postgres/PostGIS and Redis (docker-compose).
 * Own database `delyva_onboard_test` and Redis db 2. SKIPS with a message when unreachable.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, '/delyva_onboard_test');
const REDIS_URL = process.env.TEST_ONBOARD_REDIS_URL ?? 'redis://127.0.0.1:56379/2';
const PEPPER = 'integration-test-pepper-onboarding-0123456789';

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
if (!available)
  process.stderr.write('\n[SKIP] onboarding integration tests: Postgres/Redis not reachable.\n\n');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PDF = Buffer.from('%PDF-1.7\n% test document\n');
const VI = { lat: 6.429, lng: 3.418 };
const HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  opensAt: '08:00',
  closesAt: '22:00',
}));
type Body = Record<string, unknown>;

describe.skipIf(!available)('onboarding + admin (integration: Postgres/PostGIS + Redis)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let http: ReturnType<typeof request>;
  let signer: JoseAccessTokenSigner;
  let redis: Redis;
  let storageDir: string;
  let seq = 0;
  const idem = () => `onb-${String(Date.now())}-${String(++seq)}`;

  const bearer = async (userId: string, roles: string[]) =>
    `Bearer ${(await signer.sign({ userId, roles, deviceId: 'device-onboard-1' })).token}`;

  const signIn = async (phone: string) => {
    await http
      .post('/v1/auth/otp/request')
      .set('Idempotency-Key', idem())
      .send({ phone })
      .expect(202);
    const code = await redis.get(devOtpKey(phone));
    const res = await http
      .post('/v1/auth/otp/verify')
      .send({ phone, code, deviceId: 'device-onboard-1' })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string; userId: string };
  };

  const upload = async (
    auth: string,
    purpose: string,
    contentType: string,
    bytes: Buffer,
  ): Promise<string> => {
    const res = await http
      .post('/v1/uploads')
      .set('Authorization', auth)
      .set('Idempotency-Key', idem())
      .send({ purpose, contentType, sizeBytes: bytes.length })
      .expect(201);
    const t = res.body as { uploadId: string; url: string };
    const u = new URL(t.url);
    await http
      .put(`${u.pathname}${u.search}`)
      .set('content-type', contentType)
      .send(bytes)
      .expect(204);
    return t.uploadId;
  };

  const admin2fa = async (userId: string, roles: string[]) => {
    const auth = await bearer(userId, roles);
    const enrol = await http
      .post('/v1/admin/2fa/enrolment')
      .set('Authorization', auth)
      .set('Idempotency-Key', idem())
      .expect(201);
    const secret = base32Decode((enrol.body as { secret: string }).secret);
    const code = hotp(secret, totpStep(Date.now()));
    const confirmed = await http
      .post('/v1/admin/2fa/enrolment/confirm')
      .set('Authorization', auth)
      .send({ code })
      .expect(200);
    return { auth, secret, token: (confirmed.body as { token: string }).token, code };
  };

  beforeAll(async () => {
    const adminDb = new pg.Client({ connectionString: ADMIN_URL });
    await adminDb.connect();
    await adminDb.query('DROP DATABASE IF EXISTS delyva_onboard_test WITH (FORCE)');
    await adminDb.query('CREATE DATABASE delyva_onboard_test');
    await adminDb.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    await seedCatalog(DB_URL, PEPPER);
    pool = new pg.Pool({ connectionString: DB_URL });
    redis = new Redis(REDIS_URL);
    await redis.flushdb();
    storageDir = await mkdtemp(join(tmpdir(), 'delyva-onboard-'));
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
      NOTIFICATIONS_CONSUMER_ENABLED: 'false',
      STORAGE_LOCAL_DIR: storageDir,
      PUBLIC_API_URL: 'http://127.0.0.1:3312',
    });
    ({ app } = await createApp(env));
    await app.init();
    signer = app.get(JoseAccessTokenSigner);
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    redis.disconnect();
    await rm(storageDir, { recursive: true, force: true });
  });

  describe('rider onboarding → ops approval → rider role', () => {
    let rider: { accessToken: string; refreshToken: string; userId: string };
    let auth: string;
    let ops: { auth: string; token: string };
    const opsUser = '40000000-0000-4000-8000-0000000000f1';

    beforeAll(async () => {
      rider = await signIn('+2348031110001');
      auth = `Bearer ${rider.accessToken}`;
      ops = await admin2fa(opsUser, ['ops']);
    });

    it('starts as not_started, records a step view and rejects skipping steps', async () => {
      const res = await http
        .get('/v1/rider-applications/me')
        .set('Authorization', auth)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'not_started', currentStep: 'personal_details' });
      await http
        .post('/v1/rider-applications/me/step-views')
        .set('Authorization', auth)
        .send({ step: 'personal_details' })
        .expect(204);
      await http
        .post('/v1/rider-applications/me/step-views')
        .set('Authorization', auth)
        .send({ step: 'bogus' })
        .expect(400);
      const skip = await http
        .put('/v1/rider-applications/me/guarantor')
        .set('Authorization', auth)
        .send({ fullName: 'Ada Obi', phone: '+2348039990000', relationship: 'Aunt' })
        .expect(409);
      expect((skip.body as Body).detail).toMatch(/personal_details/);
    });

    it('saves personal details (adults only) and resumes at identity', async () => {
      await http
        .put('/v1/rider-applications/me/personal-details')
        .set('Authorization', auth)
        .send({
          firstName: 'Tunde',
          lastName: 'Bakare',
          dateOfBirth: '2015-01-01',
          stateOfResidence: 'Lagos',
        })
        .expect(400);
      await http
        .put('/v1/rider-applications/me/personal-details')
        .set('Authorization', auth)
        .send({
          firstName: 'Tunde',
          lastName: 'Bakare',
          dateOfBirth: '1995-04-12',
          stateOfResidence: 'Lagos',
        })
        .expect(200);
      const res = await http
        .get('/v1/rider-applications/me')
        .set('Authorization', auth)
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'in_progress',
        currentStep: 'identity',
        completedSteps: ['personal_details'],
      });
    });

    it('rejects uploads that break MIME/size policy or lie about content', async () => {
      await http
        .post('/v1/uploads')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ purpose: 'selfie', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(422);
      const res = await http
        .post('/v1/uploads')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ purpose: 'selfie', contentType: 'image/jpeg', sizeBytes: 10 })
        .expect(201);
      const u = new URL((res.body as { url: string }).url);
      await http
        .put(`${u.pathname}${u.search}`)
        .set('content-type', 'image/jpeg')
        .send(PDF)
        .expect(422);
      await http
        .put(`${u.pathname}${u.search.replace(/sig=[^&]+/, 'sig=forged')}`)
        .set('content-type', 'image/jpeg')
        .send(JPEG)
        .expect(403);
    });

    it('fails KYC with the fake provider (liveness) and keeps the step incomplete', async () => {
      const selfie = await upload(auth, 'selfie', 'image/jpeg', JPEG);
      const res = await http
        .put('/v1/rider-applications/me/identity')
        .set('Authorization', auth)
        .send({ nin: '12345678999', selfieUploadId: selfie })
        .expect(422);
      expect((res.body as Body).code).toBe('kyc_verification_failed');
      const me = await http.get('/v1/rider-applications/me').set('Authorization', auth).expect(200);
      expect(me.body).toMatchObject({
        currentStep: 'identity',
        identity: { kycStatus: 'failed', ninLast4: '8999' },
      });
    });

    it('passes KYC, then vehicle and guarantor', async () => {
      const selfie = await upload(auth, 'selfie', 'image/jpeg', JPEG);
      await http
        .put('/v1/rider-applications/me/identity')
        .set('Authorization', auth)
        .send({ nin: '12345678901', selfieUploadId: selfie })
        .expect(200);
      const other = await signIn('+2348031110009');
      const foreign = await upload(
        `Bearer ${other.accessToken}`,
        'vehicle_photo',
        'image/jpeg',
        JPEG,
      );
      await http
        .put('/v1/rider-applications/me/vehicle')
        .set('Authorization', auth)
        .send({ vehicleType: 'bicycle', vehiclePhotoUploadId: foreign })
        .expect(404);
      const licence = await upload(auth, 'drivers_licence', 'application/pdf', PDF);
      const photo = await upload(auth, 'vehicle_photo', 'image/jpeg', JPEG);
      await http
        .put('/v1/rider-applications/me/vehicle')
        .set('Authorization', auth)
        .send({
          vehicleType: 'motorcycle',
          plateNumber: 'LND123AB',
          licenceNumber: 'LAG12345',
          licenceExpiry: '2029-01-01',
          licenceUploadId: licence,
          vehiclePhotoUploadId: photo,
        })
        .expect(200);
      const g = await http
        .put('/v1/rider-applications/me/guarantor')
        .set('Authorization', auth)
        .send({ fullName: 'Ada Obi', phone: '+2348039990000', relationship: 'Aunt' })
        .expect(200);
      expect((g.body as { guarantor: Body }).guarantor).toEqual({
        fullName: 'Ada Obi',
        relationship: 'Aunt',
        phoneLast4: '0000',
      });
    });

    it('flags a bank name mismatch, then accepts it with explicit confirmation', async () => {
      const res = await http
        .put('/v1/rider-applications/me/bank-account')
        .set('Authorization', auth)
        .send({ bankCode: '058', accountNumber: '0123456789' })
        .expect(422);
      expect((res.body as Body).code).toBe('bank_account_name_mismatch');
      const ok = await http
        .put('/v1/rider-applications/me/bank-account')
        .set('Authorization', auth)
        .send({ bankCode: '058', accountNumber: '0123456789', confirmNameMismatch: true })
        .expect(200);
      expect((ok.body as { bankAccount: Body }).bankAccount).toEqual({
        bankCode: '058',
        accountNumberLast4: '6789',
        accountName: 'FAKE ACCOUNT HOLDER',
        nameMatch: false,
      });
    });

    it('stores NIN, account number and guarantor phone only as ciphertext', async () => {
      const { rows } = await pool.query<Record<string, string>>(
        'SELECT data::text AS data, nin_ciphertext, guarantor_phone_ciphertext, bank_account_ciphertext FROM rider_applications WHERE user_id = $1',
        [rider.userId],
      );
      const row = rows[0] ?? {};
      const all = Object.values(row).join(' ');
      for (const secret of ['12345678901', '0123456789', '+2348039990000'])
        expect(all).not.toContain(secret);
      expect(row.nin_ciphertext).toMatch(/^v1\.dev\./);
      expect(row.bank_account_ciphertext).toMatch(/^v1\.dev\./);
    });

    it('scores the quiz on the server; a fail does not complete the step', async () => {
      const quiz = await http
        .get('/v1/rider-applications/me/quiz')
        .set('Authorization', auth)
        .expect(200);
      expect(JSON.stringify(quiz.body)).not.toContain('answer');
      const wrong = await http
        .post('/v1/rider-applications/me/quiz')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ answers: [{ questionId: 'q1', optionId: 'c' }] })
        .expect(200);
      expect(wrong.body).toMatchObject({ passed: false, scorePercent: 0, attempts: 1 });
      await http
        .post('/v1/rider-applications/me/submit')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .expect(409);
      const right = await http
        .post('/v1/rider-applications/me/quiz')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ answers: RIDER_QUIZ.map((q) => ({ questionId: q.id, optionId: q.answer })) })
        .expect(200);
      expect(right.body).toMatchObject({ passed: true, scorePercent: 100, attempts: 2 });
    });

    it('submits and is locked while pending review', async () => {
      const res = await http
        .post('/v1/rider-applications/me/submit')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .expect(200);
      expect(res.body).toMatchObject({ status: 'pending_review', currentStep: null });
      await http
        .put('/v1/rider-applications/me/guarantor')
        .set('Authorization', auth)
        .send({ fullName: 'Ada Obi', phone: '+2348039990000', relationship: 'Aunt' })
        .expect(409);
    });

    it('denies non-admins (403) and admins without a 2FA session (two_factor_required)', async () => {
      await http.get('/v1/admin/rider-applications').set('Authorization', auth).expect(403);
      const noSession = await http
        .get('/v1/admin/rider-applications')
        .set('Authorization', ops.auth)
        .expect(403);
      expect((noSession.body as Body).code).toBe('two_factor_required');
      await http
        .get('/v1/admin/rider-applications')
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', 'forged')
        .expect(403);
    });

    it('ops (with TOTP) approves; the refreshed token carries the rider role; audit logged', async () => {
      const list = await http
        .get('/v1/admin/rider-applications')
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .expect(200);
      const item = (list.body as { items: Body[] }).items.find((i) => i.userId === rider.userId);
      expect(item).toMatchObject({
        kycStatus: 'verified',
        bankNameMatch: false,
        quizScorePercent: 100,
        fullName: 'Tunde Bakare',
      });
      const dl = await http
        .get(`/v1/admin/uploads/${String((item?.documentUploadIds as string[])[0])}/download-url`)
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .expect(200);
      const u = new URL((dl.body as { url: string }).url);
      await http.get(`${u.pathname}${u.search}`).expect(200);
      await http
        .post(`/v1/admin/rider-applications/${String(item?.id)}/approve`)
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .set('Idempotency-Key', idem())
        .send({ reason: 'no' })
        .expect(400);
      const ok = await http
        .post(`/v1/admin/rider-applications/${String(item?.id)}/approve`)
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .set('Idempotency-Key', idem())
        .send({ reason: 'KYC verified; bank name checked manually' })
        .expect(200);
      expect(ok.body).toMatchObject({ status: 'approved' });
      await http
        .post(`/v1/admin/rider-applications/${String(item?.id)}/reject`)
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .set('Idempotency-Key', idem())
        .send({ reason: 'second decision' })
        .expect(409);
      const refreshed = await http
        .post('/v1/auth/refresh')
        .send({ refreshToken: rider.refreshToken, deviceId: 'device-onboard-1' })
        .expect(200);
      expect(decodeJwt((refreshed.body as { accessToken: string }).accessToken).roles).toEqual([
        'customer',
        'rider',
      ]);
      const audit = await pool.query(
        'SELECT action, reason, actor_id FROM audit_log WHERE target_id = $1',
        [item?.id],
      );
      expect(audit.rows).toEqual([
        {
          action: 'rider_application.approved',
          reason: 'KYC verified; bank name checked manually',
          actor_id: opsUser,
        },
      ]);
      const events = await pool.query<{ type: string; n: string }>(
        "SELECT type, count(*) AS n FROM outbox_events WHERE type LIKE 'onboarding.%' GROUP BY type ORDER BY type",
      );
      expect(events.rows.map((r) => r.type)).toEqual([
        'onboarding.application.approved',
        'onboarding.application.submitted',
        'onboarding.step.completed',
        'onboarding.step.viewed',
      ]);
    });
  });

  describe('vendor onboarding → ops approval → live', () => {
    let auth: string;
    let ownerId: string;
    let ops: { auth: string; token: string };

    beforeAll(async () => {
      const owner = await signIn('+2348031110002');
      auth = `Bearer ${owner.accessToken}`;
      ownerId = owner.userId;
      ops = await admin2fa('40000000-0000-4000-8000-0000000000f2', ['ops']);
    });

    it('serves the CSV template', async () => {
      const res = await http.get('/v1/vendor-applications/menu-template').expect(200);
      expect(res.text.split('\n')[0]).toBe('category,name,description,price_naira,available');
    });

    it('completes every step, with CSV errors reported by line', async () => {
      const b = await http
        .put('/v1/vendor-applications/me/business-details')
        .set('Authorization', auth)
        .send({ businessName: 'Mama Put Kitchen', category: 'restaurant' })
        .expect(200);
      const vendorId = (b.body as { vendorId: string }).vendorId;
      expect(
        (await pool.query('SELECT status FROM vendors WHERE id = $1', [vendorId])).rows[0],
      ).toEqual({ status: 'draft' });
      const cac = await upload(auth, 'cac_certificate', 'application/pdf', PDF);
      const oid = await upload(auth, 'owner_id', 'image/jpeg', JPEG);
      await http
        .put('/v1/vendor-applications/me/documents')
        .set('Authorization', auth)
        .send({
          cacNumber: 'RC123456',
          cacCertificateUploadId: cac,
          ownerIdType: 'nin',
          ownerIdNumber: '22233344455',
          ownerIdUploadId: oid,
        })
        .expect(200);
      await http
        .put('/v1/vendor-applications/me/location')
        .set('Authorization', auth)
        .send({
          branchName: 'Main',
          addressLine: '1 Adeola Odeku, VI',
          lat: 0.1,
          lng: 0.1,
          prepMinutes: 15,
          openingHours: HOURS,
        })
        .expect(422);
      await http
        .put('/v1/vendor-applications/me/location')
        .set('Authorization', auth)
        .send({
          branchName: 'Main',
          addressLine: '1 Adeola Odeku, VI',
          ...VI,
          prepMinutes: 15,
          openingHours: HOURS,
        })
        .expect(200);
      const bad = await upload(
        auth,
        'menu_csv',
        'text/csv',
        Buffer.from('category,name,description,price_naira,available\nRice,Jollof,,abc,yes\n'),
      );
      const badRes = await http
        .post('/v1/vendor-applications/me/menu-import')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ csvUploadId: bad })
        .expect(400);
      expect((badRes.body as { errors: Body[] }).errors[0]).toMatchObject({ path: 'line 2' });
      const csv =
        'category,name,description,price_naira,available\nRice dishes,Jollof rice,Party jollof,2500,yes\nSwallow,Amala,,3000,no\n';
      const good = await upload(auth, 'menu_csv', 'text/csv', Buffer.from(csv));
      const imp = await http
        .post('/v1/vendor-applications/me/menu-import')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .send({ csvUploadId: good })
        .expect(200);
      expect(imp.body).toMatchObject({ categories: 2, items: 2 });
      const photo = await upload(auth, 'menu_photo', 'image/jpeg', JPEG);
      await http
        .put('/v1/vendor-applications/me/menu-photos')
        .set('Authorization', auth)
        .send({ uploadIds: [photo] })
        .expect(200);
      await http
        .put('/v1/vendor-applications/me/bank-account')
        .set('Authorization', auth)
        .send({ bankCode: '058', accountNumber: '0123456780' })
        .expect(422);
      await http
        .put('/v1/vendor-applications/me/bank-account')
        .set('Authorization', auth)
        .send({ bankCode: '058', accountNumber: '0123456780', confirmNameMismatch: true })
        .expect(200);
      await http
        .put('/v1/vendor-applications/me/test-order')
        .set('Authorization', auth)
        .send({
          acceptedTestOrder: true,
          markedItemUnavailable: true,
          markedOrderReady: true,
          reviewedPayoutSchedule: true,
        })
        .expect(200);
      const sub = await http
        .post('/v1/vendor-applications/me/submit')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .expect(200);
      expect(sub.body).toMatchObject({
        status: 'pending_review',
        testOrderCompleted: true,
        menu: { items: 2, photoCount: 1 },
      });
      expect(
        (await pool.query('SELECT status FROM vendors WHERE id = $1', [vendorId])).rows[0],
      ).toEqual({ status: 'in_review' });
      await http.get(`/v1/vendors/${vendorId}`).expect(404);
    });

    it('ops approves: catalog vendor goes live with the imported menu; owner gains vendor_owner', async () => {
      const list = await http
        .get('/v1/admin/vendor-applications')
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .expect(200);
      const item = (list.body as { items: Body[] }).items.find((i) => i.userId === ownerId);
      expect(item).toMatchObject({
        businessName: 'Mama Put Kitchen',
        cacNumber: 'RC123456',
        menuItems: 2,
      });
      await http
        .post(`/v1/admin/vendor-applications/${String(item?.id)}/approve`)
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .set('Idempotency-Key', idem())
        .send({ reason: 'Documents and menu reviewed' })
        .expect(200);
      const vendor = await http.get(`/v1/vendors/${String(item?.vendorId)}`).expect(200);
      const menu = (vendor.body as { menu: { categories: { items: { name: string }[] }[] } }).menu;
      const names = menu.categories.flatMap((c) => c.items.map((i) => i.name));
      expect(names.sort()).toEqual(['Amala', 'Jollof rice']);
      expect(
        (await pool.query('SELECT roles FROM users WHERE id = $1', [ownerId])).rows[0],
      ).toEqual({ roles: ['customer', 'vendor_owner'] });
      const enc = await pool.query<{ owner_id_ciphertext: string; data: string }>(
        'SELECT owner_id_ciphertext, data::text AS data FROM vendor_applications WHERE id = $1',
        [item?.id],
      );
      expect(enc.rows[0]?.data).not.toContain('22233344455');
      expect(enc.rows[0]?.owner_id_ciphertext).toMatch(/^v1\./);
    });

    it('a rejected vendor returns to draft with the reason visible in-app', async () => {
      const other = await signIn('+2348031110003');
      const a = `Bearer ${other.accessToken}`;
      await http
        .put('/v1/vendor-applications/me/business-details')
        .set('Authorization', a)
        .send({ businessName: 'Suya Spot', category: 'restaurant' })
        .expect(200);
      const { rows } = await pool.query<{ id: string; vendor_id: string }>(
        'SELECT id, vendor_id FROM vendor_applications WHERE user_id = $1',
        [other.userId],
      );
      const row = rows[0];
      await pool.query(
        "UPDATE vendor_applications SET status = 'pending_review', version = version + 1 WHERE id = $1",
        [row?.id],
      );
      await pool.query("UPDATE vendors SET status = 'in_review' WHERE id = $1", [row?.vendor_id]);
      await http
        .post(`/v1/admin/vendor-applications/${String(row?.id)}/reject`)
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .set('Idempotency-Key', idem())
        .send({ reason: 'CAC certificate unreadable' })
        .expect(200);
      const me = await http.get('/v1/vendor-applications/me').set('Authorization', a).expect(200);
      expect(me.body).toMatchObject({
        status: 'rejected',
        rejectionReason: 'CAC certificate unreadable',
      });
      expect(
        (await pool.query('SELECT status FROM vendors WHERE id = $1', [row?.vendor_id])).rows[0],
      ).toEqual({ status: 'draft' });
    });
  });

  describe('admin foundations', () => {
    it('audit log is immutable at the database level', async () => {
      const { rows } = await pool.query<{ id: string }>('SELECT id FROM audit_log LIMIT 1');
      const id = rows[0]?.id;
      await expect(
        pool.query("UPDATE audit_log SET reason = 'x' WHERE id = $1", [id]),
      ).rejects.toThrow(/append-only/);
      await expect(pool.query('DELETE FROM audit_log WHERE id = $1', [id])).rejects.toThrow(
        /append-only/,
      );
      await expect(pool.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
    });

    it('TOTP: wrong code rejected, same step cannot be replayed, a fresh step works', async () => {
      const user = '40000000-0000-4000-8000-0000000000f3';
      const { auth, secret, code } = await admin2fa(user, ['finance']);
      const wrong = code === '000000' ? '111111' : '000000';
      await http
        .post('/v1/admin/2fa/verify')
        .set('Authorization', auth)
        .send({ code: wrong })
        .expect(401);
      await http.post('/v1/admin/2fa/verify').set('Authorization', auth).send({ code }).expect(401);
      const next = hotp(secret, totpStep(Date.now()) + 1);
      await http
        .post('/v1/admin/2fa/verify')
        .set('Authorization', auth)
        .send({ code: next })
        .expect(200);
      await http
        .post('/v1/admin/2fa/enrolment')
        .set('Authorization', auth)
        .set('Idempotency-Key', idem())
        .expect(409);
      const unenrolled = await bearer('40000000-0000-4000-8000-0000000000f4', ['ops']);
      const r = await http
        .post('/v1/admin/2fa/verify')
        .set('Authorization', unenrolled)
        .send({ code: '123456' })
        .expect(403);
      expect((r.body as Body).code).toBe('two_factor_required');
      const { rows } = await pool.query<{ secret_ciphertext: string }>(
        'SELECT secret_ciphertext FROM admin_totp_factors WHERE user_id = $1',
        [user],
      );
      expect(rows[0]?.secret_ciphertext).toMatch(/^v1\./);
    });

    it('feature flags: super_admin only; disabling rider applications blocks new applicants', async () => {
      const sa = await admin2fa('40000000-0000-4000-8000-0000000000f5', ['super_admin']);
      const ops = await admin2fa('40000000-0000-4000-8000-0000000000f6', ['ops']);
      await http
        .get('/v1/admin/feature-flags')
        .set('Authorization', ops.auth)
        .set('x-admin-2fa', ops.token)
        .expect(403);
      const put = await http
        .put('/v1/admin/feature-flags')
        .set('Authorization', sa.auth)
        .set('x-admin-2fa', sa.token)
        .send({
          key: 'onboarding.rider_applications',
          enabled: false,
          description: 'Pause rider intake',
          reason: 'Enough riders in Lagos',
        })
        .expect(200);
      expect(put.body).toMatchObject({ key: 'onboarding.rider_applications', enabled: false });
      const list = await http
        .get('/v1/admin/feature-flags')
        .set('Authorization', sa.auth)
        .set('x-admin-2fa', sa.token)
        .expect(200);
      expect((list.body as { items: Body[] }).items).toHaveLength(1);
      const newcomer = await bearer('40000000-0000-4000-8000-0000000000a9', ['customer']);
      await http
        .put('/v1/rider-applications/me/personal-details')
        .set('Authorization', newcomer)
        .send({
          firstName: 'Ngozi',
          lastName: 'Eze',
          dateOfBirth: '1990-01-01',
          stateOfResidence: 'Lagos',
        })
        .expect(403);
      const audit = await pool.query(
        "SELECT before, after->>'enabled' AS enabled FROM audit_log WHERE action = 'feature_flag.updated'",
      );
      expect(audit.rows).toEqual([{ before: null, enabled: 'false' }]);
    });
  });
});
