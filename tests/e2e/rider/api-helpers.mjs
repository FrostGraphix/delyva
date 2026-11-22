// REST helpers the rider E2E uses to play the other actors (ops, customer, vendor) against the
// real API. The rider is driven only through the web UI.
import { createHmac, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import pg from 'pg';
import { E2E } from './e2e-env.mjs';

const BASE = `http://127.0.0.1:${String(E2E.apiPort)}`;

/** JSON call; throws with the problem body on non-2xx. */
export async function call(method, path, { body, token, headers = {}, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `e2e-${randomUUID()}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${String(res.status)} ${text}`);
  return json;
}

/** Latest dev OTP for a phone (non-production SMS adapter stores it in Redis). */
export async function devOtp(phone) {
  const redis = new Redis(E2E.redisUrl);
  try {
    // The SMS adapter stores the code asynchronously; poll briefly instead of racing it.
    for (let i = 0; i < 40; i += 1) {
      const code = await redis.get(`dev:otp:${phone}`);
      if (code) return code;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  } finally {
    redis.disconnect();
  }
}

/** Signs a user in through the OTP API. */
export async function signIn(phone, deviceId = `e2e-${randomUUID()}`) {
  await call('POST', '/v1/auth/otp/request', { body: { phone } });
  const code = await devOtp(phone);
  const pair = await call('POST', '/v1/auth/otp/verify', { body: { phone, code, deviceId } });
  return { ...pair, deviceId };
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for the given step. */
function totp(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Ops user with a confirmed TOTP 2FA session. The ops role is granted in SQL, as in
 * apps/api/scripts/demo-onboarding.ts (there is no admin-invite flow yet).
 */
export async function opsSession(phone) {
  const s = await signIn(phone);
  const db = new pg.Client({ connectionString: E2E.dbUrl });
  await db.connect();
  await db.query("UPDATE users SET roles = array_append(roles, 'ops') WHERE id = $1 AND NOT ('ops' = ANY(roles))", [s.userId]);
  await db.end();
  const refreshed = await call('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken, deviceId: s.deviceId } });
  const token = refreshed.accessToken;
  const enrol = await call('POST', '/v1/admin/2fa/enrolment', { token });
  const step = Math.floor(Date.now() / 30_000);
  const confirm = await call('POST', '/v1/admin/2fa/enrolment/confirm', {
    token,
    body: { code: totp(base32Decode(enrol.secret), step) },
  });
  return { token, twoFa: confirm.token };
}

/** Ops approves the rider's pending application. */
export async function approveRider(ops, riderUserId) {
  const headers = { 'x-admin-2fa': ops.twoFa };
  const list = await call('GET', '/v1/admin/rider-applications?status=pending_review', { token: ops.token, headers });
  const app = list.items.find((i) => i.userId === riderUserId);
  if (!app) throw new Error('rider application not in the ops queue');
  return call('POST', `/v1/admin/rider-applications/${app.id}/approve`, {
    token: ops.token,
    headers,
    body: { reason: 'E2E: KYC verified, bank name reviewed' },
  });
}

/** Seeded pharmacy (vendor 6, VI, open 24 h) and its first item (₦500). */
export const PHARMACY = {
  branchId: `21000000-0000-4000-8000-${(6000).toString(16).padStart(12, '0')}`,
  itemId: `25000000-0000-4000-8000-${(6001).toString(16).padStart(12, '0')}`,
  point: { lat: 6.43, lng: 3.41 },
};
/** Customer drop-off point in VI. */
export const DROPOFF = { lat: 6.4335, lng: 3.4205 };

/** Customer tops up the wallet (fake provider + signed webhook) and places a wallet order. */
export async function placeWalletOrder(customer) {
  const token = customer.accessToken;
  const topUp = await call('POST', '/v1/wallet/top-ups', { token, body: { amountMinor: 1_000_000, method: 'card' } });
  const raw = JSON.stringify({ event: 'charge.success', data: { id: Date.now(), reference: topUp.reference } });
  await call('POST', '/v1/webhooks/paystack', {
    raw,
    headers: { 'x-paystack-signature': createHmac('sha512', E2E.webhookSecret).update(raw).digest('hex') },
  });
  const address = await call('POST', '/v1/addresses', { token, body: { label: 'Home', line1: '12 Adeola Odeku St', ...DROPOFF } });
  const cart = await call('POST', '/v1/carts/lines', { token, body: { branchId: PHARMACY.branchId, itemId: PHARMACY.itemId, quantity: 2 } });
  return call('POST', '/v1/orders', { token, body: { cartId: cart.id, addressId: address.id, paymentMethod: 'wallet' } });
}

/** Vendor action on an order (accept / ready …). */
export function vendorAct(vendor, orderId, action, body = {}) {
  return call('POST', `/v1/vendor-orders/${orderId}/${action}`, { token: vendor.accessToken, body });
}

/** Customer view of an order (includes the delivery OTP). */
export function customerOrder(customer, orderId) {
  return call('GET', `/v1/orders/${orderId}`, { token: customer.accessToken });
}
