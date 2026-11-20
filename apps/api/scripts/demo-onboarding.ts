/**
 * Local demo (not shipped) against a RUNNING dev API (DEMO_BASE_URL, default http://127.0.0.1:3312):
 * rider completes an application with fake KYC → ops (TOTP 2FA) approves → refreshed rider token
 * has the `rider` role; vendor submits with a CSV menu → ops approves → vendor is live.
 * The ops user is bootstrapped by granting the role in SQL (there is no admin-invite flow yet).
 * Run: pnpm --filter @delyva/api build && node --env-file=.env dist/scripts/demo-onboarding.js
 */
import { decodeJwt } from 'jose';
import { Redis } from 'ioredis';
import pg from 'pg';
import { base32Decode, hotp, totpStep } from '../src/modules/admin/domain/totp.js';
import { devOtpKey } from '../src/modules/identity/infrastructure/sms.senders.js';
import { RIDER_QUIZ } from '../src/modules/onboarding/domain/quiz.js';

const BASE = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3312';
const DB_URL = process.env.DATABASE_URL ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';
const redis = new Redis(REDIS_URL);
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const run = String(Date.now()).slice(-7);
let n = 0;
type J = Record<string, unknown>;

const out = (label: string, value: unknown): void => {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
};

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: J }> {
  const r = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `demo-${run}-${String(++n)}`,
      ...headers,
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
  });
  const text = await r.text();
  return { status: r.status, body: text ? (JSON.parse(text) as J) : {} };
}

async function signIn(
  phone: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  await call('POST', '/v1/auth/otp/request', { phone });
  const code = await redis.get(devOtpKey(phone));
  const r = await call('POST', '/v1/auth/otp/verify', {
    phone,
    code,
    deviceId: `demo-device-${run}`,
  });
  return r.body as { accessToken: string; refreshToken: string; userId: string };
}

async function upload(
  auth: Record<string, string>,
  purpose: string,
  contentType: string,
  bytes: Buffer,
): Promise<string> {
  const t = (
    await call('POST', '/v1/uploads', { purpose, contentType, sizeBytes: bytes.length }, auth)
  ).body;
  const put = await fetch(String(t.url), {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: bytes,
  });
  out(`  upload ${purpose}`, { ticket: 201, put: put.status });
  return String(t.uploadId);
}

const step = async (
  label: string,
  method: string,
  path: string,
  body: unknown,
  auth: Record<string, string>,
) => {
  const r = await call(method, path, body, auth);
  out(`  ${label}`, {
    status: r.status,
    appStatus: r.body.status,
    currentStep: r.body.currentStep,
    code: r.body.code,
  });
  return r;
};

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(256, 7)]);
const PDF = Buffer.from('%PDF-1.7\n% demo\n');

// ---------------------------------------------------------------- ops bootstrap + TOTP
const ops = await signIn(`+234809${run}`);
await db.query(
  "UPDATE users SET roles = array_append(roles, 'ops') WHERE id = $1 AND NOT ('ops' = ANY(roles))",
  [ops.userId],
);
const opsTokens = (
  await call('POST', '/v1/auth/refresh', {
    refreshToken: ops.refreshToken,
    deviceId: `demo-device-${run}`,
  })
).body;
const opsAuth = { authorization: `Bearer ${String(opsTokens.accessToken)}` };
out('ops roles', decodeJwt(String(opsTokens.accessToken)).roles);
const enrol = await call('POST', '/v1/admin/2fa/enrolment', undefined, opsAuth);
out('ops 2FA enrolment', {
  status: enrol.status,
  otpauthUri: String(enrol.body.otpauthUri).replace(/secret=[^&]+/, 'secret=***'),
});
const secret = base32Decode(String(enrol.body.secret));
const confirm = await call(
  'POST',
  '/v1/admin/2fa/enrolment/confirm',
  { code: hotp(secret, totpStep(Date.now())) },
  opsAuth,
);
out('ops 2FA confirm', { status: confirm.status, expiresInSeconds: confirm.body.expiresInSeconds });
const noTwoFa = await call('GET', '/v1/admin/rider-applications', undefined, opsAuth);
out('admin list WITHOUT x-admin-2fa', { status: noTwoFa.status, code: noTwoFa.body.code });
const admin = { ...opsAuth, 'x-admin-2fa': String(confirm.body.token) };

// ---------------------------------------------------------------- rider
const rider = await signIn(`+234803${run}`);
const ra = { authorization: `Bearer ${rider.accessToken}` };
out('rider initial roles', decodeJwt(rider.accessToken).roles);
await step(
  'personal-details',
  'PUT',
  '/v1/rider-applications/me/personal-details',
  { firstName: 'Tunde', lastName: 'Bakare', dateOfBirth: '1995-04-12', stateOfResidence: 'Lagos' },
  ra,
);
const selfie = await upload(ra, 'selfie', 'image/jpeg', JPEG);
await step(
  'identity (fake KYC, NIN 12345678901)',
  'PUT',
  '/v1/rider-applications/me/identity',
  { nin: '12345678901', selfieUploadId: selfie },
  ra,
);
const licence = await upload(ra, 'drivers_licence', 'application/pdf', PDF);
const photo = await upload(ra, 'vehicle_photo', 'image/jpeg', JPEG);
await step(
  'vehicle',
  'PUT',
  '/v1/rider-applications/me/vehicle',
  {
    vehicleType: 'motorcycle',
    plateNumber: 'LND123AB',
    licenceNumber: 'LAG12345',
    licenceExpiry: '2029-01-01',
    licenceUploadId: licence,
    vehiclePhotoUploadId: photo,
  },
  ra,
);
await step(
  'guarantor',
  'PUT',
  '/v1/rider-applications/me/guarantor',
  { fullName: 'Ada Obi', phone: '+2348039990000', relationship: 'Aunt' },
  ra,
);
await step(
  'bank-account (name mismatch)',
  'PUT',
  '/v1/rider-applications/me/bank-account',
  { bankCode: '058', accountNumber: '0123456789' },
  ra,
);
await step(
  'bank-account (confirmed for review)',
  'PUT',
  '/v1/rider-applications/me/bank-account',
  { bankCode: '058', accountNumber: '0123456789', confirmNameMismatch: true },
  ra,
);
const quiz = await call(
  'POST',
  '/v1/rider-applications/me/quiz',
  { answers: RIDER_QUIZ.map((q) => ({ questionId: q.id, optionId: q.answer })) },
  ra,
);
out('  quiz', quiz.body);
await step('submit', 'POST', '/v1/rider-applications/me/submit', undefined, ra);
const queue = await call('GET', '/v1/admin/rider-applications', undefined, admin);
const app = (queue.body.items as J[]).find((i) => i.userId === rider.userId) ?? {};
out('ops queue item', {
  kycStatus: app.kycStatus,
  bankNameMatch: app.bankNameMatch,
  quizScorePercent: app.quizScorePercent,
});
const approve = await call(
  'POST',
  `/v1/admin/rider-applications/${String(app.id)}/approve`,
  { reason: 'KYC verified; bank name reviewed' },
  admin,
);
out('ops approve rider', { status: approve.status, appStatus: approve.body.status });
const refreshed = (
  await call('POST', '/v1/auth/refresh', {
    refreshToken: rider.refreshToken,
    deviceId: `demo-device-${run}`,
  })
).body;
out('rider roles after refresh', decodeJwt(String(refreshed.accessToken)).roles);
const enc = await db.query<{ nin: string; bank: string }>(
  'SELECT left(nin_ciphertext, 12) AS nin, left(bank_account_ciphertext, 12) AS bank FROM rider_applications WHERE user_id = $1',
  [rider.userId],
);
out('rider PII at rest (prefix only)', enc.rows[0]);

// ---------------------------------------------------------------- vendor
const owner = await signIn(`+234805${run}`);
const va = { authorization: `Bearer ${owner.accessToken}` };
const biz = await step(
  'business-details',
  'PUT',
  '/v1/vendor-applications/me/business-details',
  { businessName: `Mama Put Kitchen ${run}`, category: 'restaurant' },
  va,
);
const vendorId = String(biz.body.vendorId);
const cac = await upload(va, 'cac_certificate', 'application/pdf', PDF);
const oid = await upload(va, 'owner_id', 'image/jpeg', JPEG);
await step(
  'documents',
  'PUT',
  '/v1/vendor-applications/me/documents',
  {
    cacNumber: 'RC123456',
    cacCertificateUploadId: cac,
    ownerIdType: 'nin',
    ownerIdNumber: '22233344455',
    ownerIdUploadId: oid,
  },
  va,
);
const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  opensAt: '00:00',
  closesAt: '24:00',
}));
await step(
  'location',
  'PUT',
  '/v1/vendor-applications/me/location',
  {
    branchName: 'VI',
    addressLine: '1 Adeola Odeku, VI',
    lat: 6.429,
    lng: 3.418,
    prepMinutes: 15,
    openingHours: hours,
  },
  va,
);
const badCsv = await upload(
  va,
  'menu_csv',
  'text/csv',
  Buffer.from(
    'category,name,description,price_naira,available\nRice,Jollof,,abc,yes\nRice,,,100,yes\n',
  ),
);
const bad = await call(
  'POST',
  '/v1/vendor-applications/me/menu-import',
  { csvUploadId: badCsv },
  va,
);
out('  menu-import (bad CSV)', { status: bad.status, errors: bad.body.errors });
const goodCsv = await upload(
  va,
  'menu_csv',
  'text/csv',
  Buffer.from(
    'category,name,description,price_naira,available\nRice dishes,Jollof rice,Party jollof,2500,yes\nSwallow,Amala and ewedu,,3000.50,yes\n',
  ),
);
out(
  '  menu-import (good CSV)',
  (await call('POST', '/v1/vendor-applications/me/menu-import', { csvUploadId: goodCsv }, va)).body,
);
await step(
  'bank-account (confirmed)',
  'PUT',
  '/v1/vendor-applications/me/bank-account',
  { bankCode: '058', accountNumber: '0123456780', confirmNameMismatch: true },
  va,
);
await step(
  'test-order',
  'PUT',
  '/v1/vendor-applications/me/test-order',
  {
    acceptedTestOrder: true,
    markedItemUnavailable: true,
    markedOrderReady: true,
    reviewedPayoutSchedule: true,
  },
  va,
);
await step('submit', 'POST', '/v1/vendor-applications/me/submit', undefined, va);
out(
  'catalog vendor status after submit',
  (await db.query('SELECT status FROM vendors WHERE id = $1', [vendorId])).rows[0],
);
out('public GET vendor before approval', (await call('GET', `/v1/vendors/${vendorId}`)).status);
const vq = await call('GET', '/v1/admin/vendor-applications', undefined, admin);
const vapp = (vq.body.items as J[]).find((i) => i.userId === owner.userId) ?? {};
const vok = await call(
  'POST',
  `/v1/admin/vendor-applications/${String(vapp.id)}/approve`,
  { reason: 'CAC, ID and menu reviewed' },
  admin,
);
out('ops approve vendor', { status: vok.status, appStatus: vok.body.status });
const live = await call('GET', `/v1/vendors/${vendorId}`);
const cats = (
  live.body.menu as { categories: { name: string; items: { name: string; price: J }[] }[] }
).categories;
out('public GET vendor after approval', {
  status: live.status,
  menu: cats.map((c) => ({ c: c.name, items: c.items.map((i) => [i.name, i.price.amountMinor]) })),
});
out(
  'audit log (latest 3)',
  (await db.query('SELECT action, reason FROM audit_log ORDER BY created_at DESC LIMIT 3')).rows,
);
await db.end();
redis.disconnect();
