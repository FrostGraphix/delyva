import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { ORDER_FULFILMENT_PORT, type OrderFulfilmentPort } from '@delyva/contracts';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { seedBranchId, seedCatalog, seedVendorId } from '../scripts/seed-catalog.js';
import { runPricingSeed } from '../scripts/seed-pricing.js';
import { createApp } from '../src/create-app.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { RunDispatchRound } from '../src/modules/dispatch/application/run-dispatch-round.use-case.js';
import { OutboxDispatchConsumer } from '../src/modules/dispatch/infrastructure/outbox-dispatch.consumer.js';
import { OutboxPaymentEventsConsumer } from '../src/modules/ordering/infrastructure/adapters.js';
import type { FakePaymentProvider } from '../src/modules/payments/infrastructure/fake.provider.js';
import { signWebhook } from '../src/modules/payments/infrastructure/hmac-webhook.verifier.js';
import { PAYMENT_PROVIDER } from '../src/modules/payments/payments.module.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Ordering integration tests against the real Postgres + Redis from infra/docker-compose.yml,
 * on a dedicated database (delyva_ordering_test) and Redis db 6. They SKIP when unreachable.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, '/delyva_ordering_test');
const REDIS_URL = process.env.TEST_REDIS_URL_ORDERING ?? 'redis://127.0.0.1:56379/6';
const SECRET = 'ordering-integration-webhook-secret';
const PEPPER = 'integration-test-pepper-0123456789abcdef';
const AUTO_REJECT_SECONDS = 4;

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
  process.stderr.write('\n[SKIP] ordering integration tests: Postgres/Redis not reachable.\n\n');

type Body = Record<string, unknown>;
const b = (r: request.Response): Body => r.body as Body;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (n: number) => n.toString(16).padStart(12, '0');
/** Seeded item `serial` of vendor `n` (see scripts/seed-catalog.ts). */
const itemId = (n: number, serial: number) => `25000000-0000-4000-8000-${hex(n * 1000 + serial)}`;
const optionId = (n: number, serial: number, pos: number) =>
  `27000000-0000-4000-8000-${hex(n * 1000 + serial * 10 + pos)}`;

// Vendor 6 (pharmacy, VI, open 24h): item 1 = Paracetamol ₦500. Vendor 4 (shawarma, Ikoyi).
const PHARMACY = { vendorId: seedVendorId(6), branchId: seedBranchId(6), item: itemId(6, 1) };
const SHAWARMA = {
  vendorId: seedVendorId(4),
  branchId: seedBranchId(4),
  item: itemId(4, 1),
  cheese: optionId(4, 1, 1),
};
const VI_POINT = { lat: 6.43, lng: 3.42 };
const IKOYI_POINT = { lat: 6.45, lng: 3.44 };

describe.skipIf(!available)('ordering (integration: Postgres + Redis)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let http: ReturnType<typeof request>;
  let signer: JoseAccessTokenSigner;
  let fake: FakePaymentProvider;
  let fulfilment: OrderFulfilmentPort;
  let consumer: OutboxPaymentEventsConsumer;
  let webhookSeq = 5000;
  const vendorA = randomUUID(); // member of the pharmacy
  const vendorB = randomUUID(); // member of another vendor only
  const ops = randomUUID();

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('DROP DATABASE IF EXISTS delyva_ordering_test WITH (FORCE)');
    await admin.query('CREATE DATABASE delyva_ordering_test');
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    await seedCatalog(DB_URL, PEPPER);
    await runPricingSeed(DB_URL);
    pool = new pg.Pool({ connectionString: DB_URL });
    await pool.query(
      `UPDATE branch_opening_hours SET opens_at='00:00', closes_at='24:00' WHERE branch_id=$1`,
      [SHAWARMA.branchId],
    );
    await pool.query(
      `INSERT INTO vendor_members (vendor_id, user_id, role) VALUES ($1,$2,'owner'), ($3,$4,'owner')`,
      [PHARMACY.vendorId, vendorA, seedVendorId(2), vendorB],
    );
    const redis = new Redis(REDIS_URL);
    await redis.flushdb(); // db 6 is reserved for these tests
    redis.disconnect();
    process.env.OUTBOX_PUBLISHER_DISABLED = 'true';
    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: DB_URL,
      REDIS_URL,
      HASH_PEPPER: PEPPER,
      JWT_ISSUER: 'https://api.delyva.test',
      JWT_AUDIENCE: 'delyva-apps',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_FAKE_WEBHOOK_SECRET: SECRET,
      NOTIFICATIONS_CONSUMER_ENABLED: 'false',
      DISPATCH_CONSUMER_ENABLED: 'false',
      BULLMQ_PREFIX: 'ordering-it',
      ORDERING_AUTO_REJECT_SECONDS: String(AUTO_REJECT_SECONDS),
      ORDERING_VENDOR_COMMISSION_BPS: '1000',
    });
    ({ app } = await createApp(env));
    await app.init();
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
    signer = app.get(JoseAccessTokenSigner);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    fulfilment = app.get<OrderFulfilmentPort>(ORDER_FULFILMENT_PORT);
    consumer = app.get(OutboxPaymentEventsConsumer);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const token = async (userId: string, roles: string[]) =>
    `Bearer ${(await signer.sign({ userId, roles: roles, deviceId: 'device-it' })).token}`;
  const customer = (u: string) => token(u, ['customer']);
  const idem = () => `idem-${randomUUID()}`;

  async function webhook(reference: string) {
    const raw = JSON.stringify({ event: 'charge.success', data: { id: ++webhookSeq, reference } });
    await http
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', signWebhook(raw, SECRET))
      .send(raw)
      .expect(200);
  }

  async function topUp(user: string, amountMinor: number) {
    const res = await http
      .post('/v1/wallet/top-ups')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ amountMinor, method: 'card' })
      .expect(201);
    await webhook(b(res).reference as string);
  }

  async function address(user: string, point = VI_POINT): Promise<string> {
    const res = await http
      .post('/v1/addresses')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ label: 'Home', line1: '1 Test Street', ...point })
      .expect(201);
    return b(res).id as string;
  }

  async function cart(
    user: string,
    line: Body = { branchId: PHARMACY.branchId, itemId: PHARMACY.item, quantity: 2 },
  ): Promise<Body> {
    return b(
      await http
        .post('/v1/carts/lines')
        .set('authorization', await customer(user))
        .set('Idempotency-Key', idem())
        .send(line)
        .expect(200),
    );
  }

  async function walletOrder(user: string, opts: { topUp?: number } = {}): Promise<Body> {
    await topUp(user, opts.topUp ?? 1_000_000);
    const addressId = await address(user);
    const c = await cart(user);
    const res = await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ cartId: c.id, addressId, paymentMethod: 'wallet' })
      .expect(201);
    return b(res);
  }

  const vendorAct = async (user: string, orderId: string, action: string, body: object = {}) =>
    http
      .post(`/v1/vendor-orders/${orderId}/${action}`)
      .set('authorization', await token(user, ['vendor_owner']))
      .set('Idempotency-Key', idem())
      .send(body);

  const wallet = async (user: string) =>
    b(
      await http
        .get('/v1/wallet')
        .set('authorization', await customer(user))
        .expect(200),
    );

  it('cart re-prices from the catalog and rejects client prices', async () => {
    const user = randomUUID();
    await http
      .post('/v1/carts/lines')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ branchId: PHARMACY.branchId, itemId: PHARMACY.item, quantity: 1, unitPriceMinor: 1 })
      .expect(400);
    const c = await cart(user, {
      branchId: SHAWARMA.branchId,
      itemId: SHAWARMA.item,
      quantity: 2,
      optionIds: [SHAWARMA.cheese],
    });
    expect(c.itemsSubtotal).toEqual({ amountMinor: 940_000, currency: 'NGN' });
    const again = await cart(user, {
      branchId: SHAWARMA.branchId,
      itemId: SHAWARMA.item,
      quantity: 1,
      optionIds: [SHAWARMA.cheese],
    });
    expect((again.lines as Body[])[0]?.quantity).toBe(3);
    expect(again.version).toBe(2);
    const [line = {}] = again.lines as Body[];
    const updated = b(
      await http
        .patch(`/v1/carts/${String(again.id)}/lines/${String(line.id)}`)
        .set('authorization', await customer(user))
        .set('Idempotency-Key', idem())
        .send({ quantity: 1, optionIds: [] })
        .expect(200),
    );
    expect(updated.itemsSubtotal).toEqual({ amountMinor: 400_000, currency: 'NGN' });
    await http
      .get(`/v1/carts/${String(again.id)}`)
      .set('authorization', await customer(randomUUID()))
      .expect(404);
    const listed = b(
      await http
        .get('/v1/carts')
        .set('authorization', await customer(user))
        .expect(200),
    );
    expect(listed.items).toHaveLength(1);
    await http
      .delete(`/v1/carts/${String(again.id)}/lines/${String(line.id)}`)
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .expect(200);
    await http
      .delete(`/v1/carts/${String(again.id)}`)
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .expect(204);
  });

  it('wallet checkout end to end: PLACED, totals from server, idempotent replay, delivered → ledger split balances', async () => {
    const user = randomUUID();
    await topUp(user, 1_000_000);
    const addressId = await address(user);
    const c = await cart(user);
    const key = idem();
    const send = async () =>
      http
        .post('/v1/orders')
        .set('authorization', await customer(user))
        .set('Idempotency-Key', key)
        .send({ cartId: c.id, addressId, paymentMethod: 'wallet' });
    const first = await send();
    expect(first.status).toBe(201);
    const order = b(first);
    expect(order.status).toBe('PLACED');
    const totals = order.totals as Record<string, { amountMinor: number }>;
    expect(totals.itemsSubtotal?.amountMinor).toBe(100_000);
    const replay = await send();
    expect(replay.status).toBe(201);
    expect(b(replay).id).toBe(order.id);
    expect(
      (await pool.query('SELECT count(*)::int n FROM orders WHERE customer_id=$1', [user])).rows[0],
    ).toEqual({ n: 1 });
    expect((await wallet(user)).held).toEqual(totals.total);

    const id = order.id as string;
    const accepted = await vendorAct(vendorA, id, 'accept', { prepMinutes: 12 });
    expect(accepted.status).toBe(200);
    expect(b(accepted).pickupCode).toMatch(/^\d{4}$/);
    const ev = await pool.query<{ payload: unknown }>(
      `SELECT payload FROM outbox_events WHERE type='ordering.order.vendor_accepted' AND aggregate_id=$1`,
      [id],
    );
    expect(ev.rows[0]?.payload).toMatchObject({
      orderId: id,
      branchId: PHARMACY.branchId,
      prepMinutes: 12,
      pickup: { lat: 6.43, lng: 3.41 },
      dropoff: VI_POINT,
    });

    const rider = randomUUID();
    expect(await fulfilment.markRiderAssigned(id, rider)).toEqual({
      orderId: id,
      status: 'VENDOR_ACCEPTED',
    });
    const ready = b(await vendorAct(vendorA, id, 'ready'));
    expect(ready.status).toBe('RIDER_ASSIGNED');
    await expect(fulfilment.markPickedUp(id, randomUUID())).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(fulfilment.markRiderAtVendor(id, rider, '99999')).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await fulfilment.markRiderAtVendor(id, rider, ready.pickupCode as string);
    await fulfilment.markPickedUp(id, rider);
    await fulfilment.markRiderAtCustomer(id, rider);
    const mine = b(
      await http
        .get(`/v1/orders/${id}`)
        .set('authorization', await customer(user))
        .expect(200),
    );
    expect(mine.pickupCode).toBeNull();
    await expect(
      fulfilment.markDelivered(id, rider, mine.deliveryOtp === '0000' ? '0001' : '0000'),
    ).rejects.toBeDefined();
    expect(await fulfilment.markDelivered(id, rider, mine.deliveryOtp as string)).toEqual({
      orderId: id,
      status: 'DELIVERED',
    });
    expect(await fulfilment.markDelivered(id, rider, mine.deliveryOtp as string)).toEqual({
      orderId: id,
      status: 'DELIVERED',
    });

    const legs = await pool.query<{ code: string; amount: string }>(
      `SELECT a.code, sum(e.amount_minor)::text amount FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.transaction_id JOIN ledger_accounts a ON a.id = e.account_id
       WHERE t.reference=$1 AND t.kind='order_capture' GROUP BY a.code`,
      [id],
    );
    const by = Object.fromEntries(legs.rows.map((r) => [r.code, Number(r.amount)]));
    expect(Object.values(by).reduce((s, v) => s + v, 0)).toBe(0);
    expect(by[`vendor_payable:${PHARMACY.vendorId}`]).toBe(-90_000); // credit; 10 % commission
    expect(by[`rider_payable:${rider}`]).toBeLessThan(0);
    expect(Math.abs(by[`customer_wallet:${user}`] ?? 0)).toBe(totals.total?.amountMinor);
    const timeline = (
      b(await http.get(`/v1/orders/${id}`).set('authorization', await customer(user)))
        .timeline as Body[]
    ).map((t) => t.status);
    expect(timeline).toEqual([
      'PENDING_PAYMENT',
      'PLACED',
      'VENDOR_ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'RIDER_AT_VENDOR',
      'PICKED_UP',
      'RIDER_AT_CUSTOMER',
      'DELIVERED',
    ]);
  });

  it('checkout ignores tampering, needs an Idempotency-Key and rejects insufficient funds atomically', async () => {
    const user = randomUUID();
    const addressId = await address(user);
    const c = await cart(user);
    await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .send({ cartId: c.id, addressId, paymentMethod: 'wallet' })
      .expect(400);
    await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ cartId: c.id, addressId, paymentMethod: 'wallet', totalMinor: 1 })
      .expect(400);
    const poor = await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ cartId: c.id, addressId, paymentMethod: 'wallet' });
    expect(poor.status).toBe(409);
    expect(
      (await pool.query('SELECT count(*)::int n FROM orders WHERE customer_id=$1', [user])).rows[0],
    ).toEqual({ n: 1 - 1 });
    const farAway = await address(user, IKOYI_POINT);
    await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ cartId: c.id, addressId: farAway, paymentMethod: 'wallet' })
      .expect(422);
  });

  it('applies and redeems a promo atomically with the order', async () => {
    const user = randomUUID();
    await topUp(user, 1_000_000);
    const addressId = await address(user);
    const c = await cart(user, { branchId: PHARMACY.branchId, itemId: PHARMACY.item, quantity: 6 });
    const res = await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ cartId: c.id, addressId, paymentMethod: 'wallet', promoCode: 'TUNDE50' })
      .expect(201);
    expect(b(res).promoCode).toBe('TUNDE50');
    expect((b(res).totals as Body).discount).toEqual({ amountMinor: 50_000, currency: 'NGN' });
    const r = await pool.query(
      'SELECT discount_minor::int AS discount_minor FROM promo_redemptions WHERE order_id=$1',
      [b(res).id],
    );
    expect(r.rows).toEqual([{ discount_minor: 50_000 }]);
  });

  it('card checkout: PENDING_PAYMENT → signed webhook → PLACED; failure → PAYMENT_FAILED', async () => {
    const user = randomUUID();
    const addressId = await address(user);
    const c = await cart(user);
    const res = await http
      .post('/v1/orders')
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ cartId: c.id, addressId, paymentMethod: 'card' })
      .expect(201);
    const order = b(res);
    expect(order.status).toBe('PENDING_PAYMENT');
    const payment = order.payment as Body;
    expect(payment.authorizationUrl).toMatch(/^https:\/\/checkout\.fake\.invalid\//);
    const intent = await pool.query<{ reference: string }>(
      'SELECT reference FROM payment_intents WHERE order_id=$1',
      [order.id],
    );
    await webhook(intent.rows[0]?.reference ?? '');
    await consumer.consumeBatch();
    const placed = b(
      await http
        .get(`/v1/orders/${String(order.id)}`)
        .set('authorization', await customer(user))
        .expect(200),
    );
    expect(placed.status).toBe('PLACED');
    expect((placed.payment as Body).intentStatus).toBe('succeeded');

    const user2 = randomUUID();
    const c2 = await cart(user2);
    const res2 = await http
      .post('/v1/orders')
      .set('authorization', await customer(user2))
      .set('Idempotency-Key', idem())
      .send({ cartId: c2.id, addressId: await address(user2), paymentMethod: 'card' })
      .expect(201);
    const ref2 =
      (
        await pool.query<{ reference: string }>(
          'SELECT reference FROM payment_intents WHERE order_id=$1',
          [b(res2).id],
        )
      ).rows[0]?.reference ?? '';
    fake.setOutcome(ref2, 'failed');
    await webhook(ref2);
    await consumer.consumeBatch();
    const failed = b(
      await http
        .get(`/v1/orders/${String(b(res2).id)}`)
        .set('authorization', await customer(user2)),
    );
    expect(failed.status).toBe('PAYMENT_FAILED');
  });

  it('vendor and customer IDOR: foreign vendor and customer get 404, non-vendors 403', async () => {
    const user = randomUUID();
    const order = await walletOrder(user);
    const id = order.id as string;
    expect((await vendorAct(vendorB, id, 'accept', { prepMinutes: 10 })).status).toBe(404);
    const asCustomer = await http
      .post(`/v1/vendor-orders/${id}/accept`)
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ prepMinutes: 10 });
    expect(asCustomer.status).toBe(403);
    await http
      .get(`/v1/orders/${id}`)
      .set('authorization', await customer(randomUUID()))
      .expect(404);
    await http
      .post(`/v1/orders/${id}/cancel`)
      .set('authorization', await customer(randomUUID()))
      .set('Idempotency-Key', idem())
      .send({})
      .expect(404);
    await http
      .get(`/v1/vendors/${PHARMACY.vendorId}/orders`)
      .set('authorization', await token(vendorB, ['vendor_owner']))
      .expect(403);
    const list = b(
      await http
        .get(`/v1/vendors/${PHARMACY.vendorId}/orders?status=PLACED`)
        .set('authorization', await token(vendorA, ['vendor_owner']))
        .expect(200),
    );
    expect((list.items as Body[]).some((o) => o.id === id)).toBe(true);
    const mine = b(
      await http
        .get('/v1/orders?limit=1')
        .set('authorization', await customer(user))
        .expect(200),
    );
    expect((mine.items as Body[])[0]?.id).toBe(id);
    await vendorAct(vendorA, id, 'accept', { prepMinutes: 10 }); // stop the auto-reject timer
  });

  it('customer cancel releases the hold; rejected after PREPARING; vendor reject refunds', async () => {
    const user = randomUUID();
    const o1 = await walletOrder(user);
    const cancelled = b(
      await http
        .post(`/v1/orders/${String(o1.id)}/cancel`)
        .set('authorization', await customer(user))
        .set('Idempotency-Key', idem())
        .send({ reason: 'changed my mind' })
        .expect(200),
    );
    expect(cancelled.status).toBe('REFUNDED');
    expect((await wallet(user)).held).toEqual({ amountMinor: 0, currency: 'NGN' });

    const o2 = await walletOrder(user, { topUp: 10_000 });
    await vendorAct(vendorA, o2.id as string, 'accept', { prepMinutes: 5 });
    await vendorAct(vendorA, o2.id as string, 'preparing').then((r) => {
      expect(r.status).toBe(200);
    });
    await http
      .post(`/v1/orders/${String(o2.id)}/cancel`)
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({})
      .expect(409);

    const o3 = await walletOrder(user, { topUp: 10_000 });
    const rejected = b(
      await vendorAct(vendorA, o3.id as string, 'reject', { reason: 'out of stock' }),
    );
    expect(rejected.status).toBe('REFUNDED');
    const reorder = b(
      await http
        .post(`/v1/orders/${String(o3.id)}/reorder`)
        .set('authorization', await customer(user))
        .set('Idempotency-Key', idem())
        .expect(200),
    );
    expect(reorder.branchId).toBe(PHARMACY.branchId);
  });

  it('ops cancel needs a role and a reason; undeliverable refunds', async () => {
    const user = randomUUID();
    const o = await walletOrder(user);
    const id = o.id as string;
    await http
      .post(`/v1/admin/orders/${id}/cancel`)
      .set('authorization', await customer(user))
      .set('Idempotency-Key', idem())
      .send({ reason: 'fraud check' })
      .expect(403);
    await http
      .post(`/v1/admin/orders/${id}/cancel`)
      .set('authorization', await token(ops, ['ops']))
      .set('Idempotency-Key', idem())
      .send({})
      .expect(400);
    const done = b(
      await http
        .post(`/v1/admin/orders/${id}/cancel`)
        .set('authorization', await token(ops, ['ops']))
        .set('Idempotency-Key', idem())
        .send({ reason: 'fraud check' })
        .expect(200),
    );
    expect(done.status).toBe('REFUNDED');
    const audit = await pool.query<{ payload: unknown }>(
      `SELECT payload FROM outbox_events WHERE type='ordering.order.cancelled_by_ops' AND aggregate_id=$1`,
      [id],
    );
    expect(audit.rows[0]?.payload).toMatchObject({
      actor: { type: 'ops', id: ops },
      reason: 'fraud check',
    });
    const listed = b(
      await http
        .get(`/v1/admin/orders?status=REFUNDED&customerId=${user}`)
        .set('authorization', await token(ops, ['ops']))
        .expect(200),
    );
    expect(listed.items).toHaveLength(1);

    const o2 = await walletOrder(user);
    const id2 = o2.id as string;
    await vendorAct(vendorA, id2, 'accept', { prepMinutes: 5 });
    const rider = randomUUID();
    const ready = b(await vendorAct(vendorA, id2, 'ready'));
    await fulfilment.markRiderAssigned(id2, rider);
    await fulfilment.markRiderAtVendor(id2, rider, ready.pickupCode as string);
    await fulfilment.markPickedUp(id2, rider);
    expect(await fulfilment.markUndeliverable(id2, rider, 'customer unreachable')).toEqual({
      orderId: id2,
      status: 'REFUNDED',
    });
    expect((await wallet(user)).held).toEqual({ amountMinor: 0, currency: 'NGN' });
  });

  it('auto-rejects a PLACED order the vendor ignores and releases the hold', async () => {
    const user = randomUUID();
    const o = await walletOrder(user);
    await sleep((AUTO_REJECT_SECONDS + 3) * 1000);
    const after = b(
      await http
        .get(`/v1/orders/${String(o.id)}`)
        .set('authorization', await customer(user))
        .expect(200),
    );
    expect(after.status).toBe('REFUNDED');
    expect((after.timeline as Body[]).find((t) => t.status === 'VENDOR_REJECTED')).toMatchObject({
      actorType: 'system',
      reason: 'vendor_timeout',
    });
    expect((await wallet(user)).held).toEqual({ amountMinor: 0, currency: 'NGN' });
  }, 30_000);

  it('authorizes order rooms for participants only', async () => {
    const user = randomUUID();
    const o = await walletOrder(user);
    const { ORDER_ROOM_AUTHORIZER } = await import('../src/modules/realtime/application/ports.js');
    const authz = app.get<{
      canJoin: (p: { userId: string; roles: string[] }, id: string) => Promise<boolean>;
    }>(ORDER_ROOM_AUTHORIZER);
    expect(await authz.canJoin({ userId: user, roles: [] }, o.id as string)).toBe(true);
    expect(await authz.canJoin({ userId: vendorA, roles: [] }, o.id as string)).toBe(true);
    expect(await authz.canJoin({ userId: vendorB, roles: [] }, o.id as string)).toBe(false);
    expect(await authz.canJoin({ userId: user, roles: [] }, randomUUID())).toBe(false);
    await vendorAct(vendorA, o.id as string, 'accept', { prepMinutes: 5 });
  });
  it('full journey: vendor_accepted → dispatch offer → rider accepts → RIDER_ASSIGNED → delivered with OTP → ledger split', async () => {
    // Arrange: a paid order and an online rider next to the pharmacy.
    const user = randomUUID();
    const order = await walletOrder(user);
    const id = order.id as string;
    const rider = randomUUID();
    const riderAuth = await token(rider, ['rider']);
    const locate = async (p: { lat: number; lng: number }) => {
      await sleep(5);
      await http
        .post('/v1/riders/me/locations')
        .set('authorization', riderAuth)
        .send({ points: [{ ...p, ts: Date.now() }] })
        .expect(202);
    };
    await http
      .post('/v1/riders/me/online')
      .set('authorization', riderAuth)
      .set('Idempotency-Key', idem())
      .send({ batteryPct: 90 })
      .expect(200);
    await locate({ lat: 6.4301, lng: 3.4101 });

    // Act: vendor accepts → event → dispatch schedules and offers.
    expect((await vendorAct(vendorA, id, 'accept', { prepMinutes: 1 })).status).toBe(200);
    expect(await app.get(OutboxDispatchConsumer).consumeBatch()).toBeGreaterThanOrEqual(1);
    await app.get(RunDispatchRound).execute(id);
    const offer = await pool.query<{ id: string; rider_id: string }>(
      `SELECT id, rider_id FROM dispatch_offers WHERE order_id=$1 AND status='pending'`,
      [id],
    );
    expect(offer.rows[0]?.rider_id).toBe(rider);
    const trip = await http
      .post(`/v1/dispatch-offers/${offer.rows[0]?.id ?? ''}/accept`)
      .set('authorization', riderAuth)
      .set('Idempotency-Key', idem())
      .expect(200);
    const tripId = (trip.body as { id: string }).id;
    // Rider bound during prep (strict table), RIDER_ASSIGNED once the vendor marks ready.
    expect(
      (
        b(await http.get(`/v1/orders/${id}`).set('authorization', await customer(user)))
          .rider as Body
      ).id,
    ).toBe(rider);
    expect(await fulfilment.markRiderAssigned(id, rider)).toMatchObject({ orderId: id }); // idempotent replay
    const ready = b(await vendorAct(vendorA, id, 'ready'));
    expect(ready.status).toBe('RIDER_ASSIGNED');

    const act = (path: string, body: object) =>
      http
        .post(`/v1/trips/${tripId}/${path}`)
        .set('authorization', riderAuth)
        .set('Idempotency-Key', idem())
        .send(body);
    await locate({ lat: 6.43, lng: 3.41 });
    await act('arrived-at-vendor', { pickupCode: ready.pickupCode }).expect(200);
    await act('picked-up', {}).expect(200);
    await locate(VI_POINT);
    await act('arrived-at-customer', {}).expect(200);
    const otp = b(await http.get(`/v1/orders/${id}`).set('authorization', await customer(user)))
      .deliveryOtp as string;
    await act('delivered', { deliveryOtp: otp }).expect(200);

    // Assert: ordering is DELIVERED and the capture journal balances.
    expect(
      b(await http.get(`/v1/orders/${id}`).set('authorization', await customer(user))).status,
    ).toBe('DELIVERED');
    const legs = await pool.query<{ code: string; amount: string }>(
      `SELECT a.code, sum(e.amount_minor)::text amount FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.transaction_id JOIN ledger_accounts a ON a.id = e.account_id
       WHERE t.reference=$1 AND t.kind='order_capture' GROUP BY a.code`,
      [id],
    );
    const by = Object.fromEntries(legs.rows.map((r) => [r.code, Number(r.amount)]));
    expect(Object.values(by).reduce((s, v) => s + v, 0)).toBe(0);
    expect(by[`rider_payable:${rider}`]).toBeLessThan(0);
    expect(by[`vendor_payable:${PHARMACY.vendorId}`]).toBe(-90_000);
  });
});
