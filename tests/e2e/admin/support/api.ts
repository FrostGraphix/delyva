import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const requireFromApp = createRequire(path.join(root, 'apps/admin-web/package.json'));

/** Direct API origin of the E2E stack (never used by the browser, only by test setup). */
export const API = 'http://127.0.0.1:3323';
const WEBHOOK_SECRET = 'adminweb-e2e-webhook-secret';
const DB_URL = 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva_adminweb_e2e';
const REDIS_URL = 'redis://127.0.0.1:56379/6';

type Json = Record<string, unknown>;

/** A signed-in API user. */
export interface Actor {
  readonly phone: string;
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly deviceId: string;
}

/** Unique Nigerian mobile number (+234 8 0 xxxxxxxx) per call. */
export function newPhone(): string {
  const n = (Date.now() % 10_000_000) * 10 + Math.floor(Math.random() * 10);
  return `+23480${String(n).padStart(8, '0')}`;
}

/** JSON call to the API. */
export async function call(
  method: string,
  p: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {} };
}

/** Reads the latest dev OTP for a phone from Redis db 6. */
export async function devOtp(phone: string): Promise<string> {
  const { Redis } = requireFromApp('ioredis') as typeof import('ioredis');
  const redis = new Redis(REDIS_URL);
  try {
    const code = await redis.get(`dev:otp:${phone}`);
    if (!code) throw new Error(`no dev OTP for ${phone}`);
    return code;
  } finally {
    redis.disconnect();
  }
}

/** When each phone last requested an OTP (the API enforces a 60 s resend cooldown). */
export const otpRequestedAt = new Map<string, number>();

/** Waits until the per-phone OTP resend cooldown has passed. */
export async function waitForOtpCooldown(phone: string, cooldownMs = 61_000): Promise<void> {
  const wait = (otpRequestedAt.get(phone) ?? 0) + cooldownMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Signs a phone in through the real OTP flow (creates the user on first use). */
export async function signIn(phone: string, deviceId = `e2e-${randomUUID()}`): Promise<Actor> {
  otpRequestedAt.set(phone, Date.now());
  const req = await call('POST', '/v1/auth/otp/request', { phone });
  if (req.status !== 202) throw new Error(`otp request ${String(req.status)}`);
  const code = await devOtp(phone);
  const res = await call('POST', '/v1/auth/otp/verify', { phone, code, deviceId });
  if (res.status !== 200) {
    throw new Error(`otp verify ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
  const t = res.body as { accessToken: string; refreshToken: string; userId: string };
  return {
    phone,
    userId: t.userId,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    deviceId,
  };
}

/** Refreshes an actor's tokens (picks up newly granted roles). */
export async function refresh(a: Actor): Promise<Actor> {
  const res = await call('POST', '/v1/auth/refresh', {
    refreshToken: a.refreshToken,
    deviceId: a.deviceId,
  });
  const t = res.body as { accessToken: string; refreshToken: string };
  return { ...a, accessToken: t.accessToken, refreshToken: t.refreshToken };
}

const bearer = (a: Actor): Record<string, string> => ({ authorization: `Bearer ${a.accessToken}` });

/** Grants roles by SQL (there is no admin-invite flow yet; same bootstrap as the onboarding demo). */
export async function grantRoles(userId: string, roles: readonly string[]): Promise<void> {
  const pg = requireFromApp('pg') as typeof import('pg');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const role of roles) {
      await client.query(
        'UPDATE users SET roles = array_append(roles, $2) WHERE id = $1 AND NOT ($2 = ANY(roles))',
        [userId, role],
      );
    }
  } finally {
    await client.end();
  }
}

interface MenuView {
  menu: {
    categories: { items: { id: string; available: boolean; modifierGroups: unknown[] }[] }[];
  };
}

/** Creates an order via the real checkout (wallet top-up via a signed fake webhook). */
export async function createOrder(customer: Actor): Promise<{ id: string; ref: string }> {
  const auth = bearer(customer);
  const top = await call(
    'POST',
    '/v1/wallet/top-ups',
    { amountMinor: 5_000_000, method: 'card' },
    auth,
  );
  if (top.status !== 201) throw new Error(`top-up ${String(top.status)}`);
  const raw = JSON.stringify({
    event: 'charge.success',
    data: { id: Date.now(), reference: top.body.reference },
  });
  const hook = await fetch(`${API}/v1/webhooks/paystack`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-paystack-signature': createHmac('sha512', WEBHOOK_SECRET).update(raw).digest('hex'),
    },
    body: raw,
  });
  if (hook.status !== 200) throw new Error(`webhook ${String(hook.status)}`);
  const addr = await call(
    'POST',
    '/v1/addresses',
    { label: 'Home', line1: '1 Test Street', lat: 6.43, lng: 3.42 },
    auth,
  );
  const found = await call('GET', '/v1/vendors?lat=6.43&lng=3.42', undefined, auth);
  const vendors = found.body.items as { id: string; branchId: string }[];
  for (const v of vendors) {
    const detail = await call('GET', `/v1/vendors/${v.id}`, undefined, auth);
    const item = (detail.body as unknown as MenuView).menu.categories
      .flatMap((c) => c.items)
      .find((i) => i.available && i.modifierGroups.length === 0);
    if (!item) continue;
    const cart = await call(
      'POST',
      '/v1/carts/lines',
      { branchId: v.branchId, itemId: item.id, quantity: 2 },
      auth,
    );
    const order = await call(
      'POST',
      '/v1/orders',
      { cartId: cart.body.id, addressId: addr.body.id, paymentMethod: 'wallet' },
      auth,
    );
    if (order.status !== 201) {
      throw new Error(`checkout ${String(order.status)} ${JSON.stringify(order.body)}`);
    }
    return { id: order.body.id as string, ref: order.body.ref as string };
  }
  throw new Error('no orderable vendor found in the seed');
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(256, 7)]);
const PDF = Buffer.from('%PDF-1.7\n% e2e\n');

async function upload(
  a: Actor,
  purpose: string,
  contentType: string,
  bytes: Buffer,
): Promise<string> {
  const t = await call(
    'POST',
    '/v1/uploads',
    { purpose, contentType, sizeBytes: bytes.length },
    bearer(a),
  );
  const put = await fetch(String(t.body.url), {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: bytes,
  });
  if (put.status >= 300) throw new Error(`upload ${purpose} ${String(put.status)}`);
  return String(t.body.uploadId);
}

async function step(a: Actor, method: string, p: string, body: unknown): Promise<Json> {
  const r = await call(method, p, body, bearer(a));
  if (r.status >= 300) {
    throw new Error(`${method} ${p} -> ${String(r.status)} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

/** Fills and submits a rider application with the deterministic fake KYC (NIN 12345678901). */
export async function submitRiderApplication(
  a: Actor,
  firstName: string,
  lastName: string,
): Promise<void> {
  const base = '/v1/rider-applications/me';
  await step(a, 'PUT', `${base}/personal-details`, {
    firstName,
    lastName,
    dateOfBirth: '1995-04-12',
    stateOfResidence: 'Lagos',
  });
  const selfie = await upload(a, 'selfie', 'image/jpeg', JPEG);
  await step(a, 'PUT', `${base}/identity`, { nin: '12345678901', selfieUploadId: selfie });
  const licence = await upload(a, 'drivers_licence', 'application/pdf', PDF);
  const photo = await upload(a, 'vehicle_photo', 'image/jpeg', JPEG);
  await step(a, 'PUT', `${base}/vehicle`, {
    vehicleType: 'motorcycle',
    plateNumber: 'LND123AB',
    licenceNumber: 'LAG12345',
    licenceExpiry: '2029-01-01',
    licenceUploadId: licence,
    vehiclePhotoUploadId: photo,
  });
  await step(a, 'PUT', `${base}/guarantor`, {
    fullName: 'Ada Obi',
    phone: '+2348039990000',
    relationship: 'Aunt',
  });
  await step(a, 'PUT', `${base}/bank-account`, {
    bankCode: '058',
    accountNumber: '0123456789',
    confirmNameMismatch: true,
  });
  const quizPath = path.join(root, 'apps/api/dist/src/modules/onboarding/domain/quiz.js');
  const quiz = requireFromApp(quizPath) as {
    RIDER_QUIZ: { id: string; answer: string }[];
  };
  await step(a, 'POST', `${base}/quiz`, {
    answers: quiz.RIDER_QUIZ.map((q) => ({ questionId: q.id, optionId: q.answer })),
  });
  await step(a, 'POST', `${base}/submit`, undefined);
}

/** Fills and submits a vendor application (CSV menu import) with fake providers. */
export async function submitVendorApplication(a: Actor, businessName: string): Promise<void> {
  const base = '/v1/vendor-applications/me';
  await step(a, 'PUT', `${base}/business-details`, { businessName, category: 'restaurant' });
  const cac = await upload(a, 'cac_certificate', 'application/pdf', PDF);
  const oid = await upload(a, 'owner_id', 'image/jpeg', JPEG);
  await step(a, 'PUT', `${base}/documents`, {
    cacNumber: 'RC123456',
    cacCertificateUploadId: cac,
    ownerIdType: 'nin',
    ownerIdNumber: '22233344455',
    ownerIdUploadId: oid,
  });
  const openingHours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    opensAt: '00:00',
    closesAt: '24:00',
  }));
  await step(a, 'PUT', `${base}/location`, {
    branchName: 'VI',
    addressLine: '1 Adeola Odeku, VI',
    lat: 6.429,
    lng: 3.418,
    prepMinutes: 15,
    openingHours,
  });
  const csv = await upload(
    a,
    'menu_csv',
    'text/csv',
    Buffer.from(
      'category,name,description,price_naira,available\nRice dishes,Jollof rice,Party jollof,2500,yes\n',
    ),
  );
  await step(a, 'POST', `${base}/menu-import`, { csvUploadId: csv });
  await step(a, 'PUT', `${base}/bank-account`, {
    bankCode: '058',
    accountNumber: '0123456780',
    confirmNameMismatch: true,
  });
  await step(a, 'PUT', `${base}/test-order`, {
    acceptedTestOrder: true,
    markedItemUnavailable: true,
    markedOrderReady: true,
    reviewedPayoutSchedule: true,
  });
  await step(a, 'POST', `${base}/submit`, undefined);
}

/** Puts an approved rider online with a position (appears on the live ops map). */
export async function riderGoOnline(a: Actor): Promise<void> {
  const fresh = await refresh(a);
  await step(fresh, 'POST', '/v1/riders/me/online', { batteryPct: 80 });
  await step(fresh, 'POST', '/v1/riders/me/locations', {
    points: [{ lat: 6.43, lng: 3.42, ts: Date.now() }],
  });
}
