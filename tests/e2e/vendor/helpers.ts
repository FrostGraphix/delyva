import { createHmac, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { type Page, expect } from '@playwright/test';
import { API_URL, REDIS_URL, WEBHOOK_SECRET } from './env';

/** Reads the latest dev OTP for a phone (non-production SMS adapter stores it in Redis db 5). */
export async function readOtp(phone: string): Promise<string> {
  const redis = new Redis(REDIS_URL);
  try {
    for (let i = 0; i < 40; i++) {
      const code = await redis.get(`dev:otp:${phone}`);
      if (code) return code;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`no dev OTP for ${phone}`);
  } finally {
    redis.disconnect();
  }
}

/** Signs in through the real login page (phone + OTP) and waits for the signed-in area. */
export async function loginViaUi(page: Page, phone: string, landing: RegExp): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const redis = new Redis(REDIS_URL);
  await redis.del(`dev:otp:${phone}`);
  redis.disconnect();
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  await page.getByLabel('6-digit code').fill(await readOtp(phone));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(landing);
}

async function api<T>(path: string, init: RequestInit & { token?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.json === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${String(res.status)} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Signs a customer in through the API (OTP via Redis) and returns their access token. */
export async function customerToken(phone: string): Promise<string> {
  await api('/v1/auth/otp/request', { json: { phone } });
  const code = await readOtp(phone);
  const pair = await api<{ accessToken: string }>('/v1/auth/otp/verify', {
    json: { phone, code, deviceId: 'e2e-customer-device-1' },
  });
  return pair.accessToken;
}

interface Item { id: string; name: string; price: { amountMinor: number }; available: boolean }
interface VendorPublic {
  branches: { id: string; openingHours: { dayOfWeek: number }[] }[];
  menu: { categories: { items: Item[] }[] };
}

/** Public vendor read (what customers see). */
export const publicVendor = (vendorId: string): Promise<VendorPublic> => api(`/v1/vendors/${vendorId}`);

let webhookSeq = Date.now() % 1_000_000;

/** Tops the wallet up through the fake provider and signed webhook, then places a wallet order. */
export async function placeWalletOrder(token: string, vendorId: string): Promise<{ id: string; ref: string }> {
  const vendor = await publicVendor(vendorId);
  const branch = vendor.branches[0];
  const item = vendor.menu.categories.flatMap((c) => c.items).find((i) => i.available);
  if (!branch || !item) throw new Error('seed vendor has no branch/item');
  const topUp = await api<{ reference: string }>('/v1/wallet/top-ups', {
    token,
    json: { amountMinor: 2_000_000, method: 'card' },
  });
  const raw = JSON.stringify({ event: 'charge.success', data: { id: ++webhookSeq, reference: topUp.reference } });
  const sig = createHmac('sha512', WEBHOOK_SECRET).update(raw).digest('hex');
  const hook = await fetch(`${API_URL}/v1/webhooks/paystack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paystack-signature': sig },
    body: raw,
  });
  if (!hook.ok) throw new Error(`webhook ${String(hook.status)} ${await hook.text()}`);
  const address = await api<{ id: string }>('/v1/addresses', {
    token,
    json: { label: 'Home', line1: '1 Test Street, Yaba', lat: 6.51, lng: 3.38 },
  });
  const cart = await api<{ id: string }>('/v1/carts/lines', {
    token,
    json: { branchId: branch.id, itemId: item.id, quantity: 2 },
  });
  for (let i = 0; i < 20; i++) {
    try {
      return await api<{ id: string; ref: string }>('/v1/orders', {
        token,
        json: { cartId: cart.id, addressId: address.id, paymentMethod: 'wallet' },
      });
    } catch (err) {
      if (i === 19) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('unreachable');
}
