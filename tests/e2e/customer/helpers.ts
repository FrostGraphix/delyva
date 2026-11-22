import { createHmac, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { API_URL, REDIS_URL, WEBHOOK_SECRET } from './env.js';

/** Reads the latest OTP the dev SMS adapter stored in Redis (`dev:otp:<phone>`, non-production only). */
export async function readDevOtp(phone: string): Promise<string> {
  const redis = new Redis(REDIS_URL);
  try {
    for (let i = 0; i < 40; i++) {
      const code = await redis.get(`dev:otp:${phone}`);
      if (code) return code;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`no dev OTP for ${phone}`);
  } finally {
    await redis.quit();
  }
}

/** Sends a Paystack-style `charge.success` webhook signed with the fake provider secret. */
export async function sendChargeSuccess(reference: string, eventId: number): Promise<void> {
  const raw = JSON.stringify({ event: 'charge.success', data: { id: eventId, reference } });
  const signature = createHmac('sha512', WEBHOOK_SECRET).update(raw).digest('hex');
  const res = await fetch(`${API_URL}/v1/webhooks/paystack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paystack-signature': signature },
    body: raw,
  });
  if (!res.ok) throw new Error(`webhook failed: ${String(res.status)}`);
}

/** Minimal authenticated JSON call to the real API. */
export async function apiCall<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${String(res.status)} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Signs a user in through the real OTP flow and returns the access token. */
export async function signInViaOtp(phone: string): Promise<string> {
  await apiCall('POST', '/v1/auth/otp/request', null, { phone });
  const code = await readDevOtp(phone);
  const pair = await apiCall<{ accessToken: string }>('POST', '/v1/auth/otp/verify', null, {
    phone,
    code,
    deviceId: `e2e-vendor-${randomUUID()}`,
  });
  return pair.accessToken;
}
