import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Money } from '@delyva/utils';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { createApp } from '../src/create-app.js';
import { JoseAccessTokenSigner } from '../src/modules/identity/infrastructure/jose-access-token.signer.js';
import { PaymentsService } from '../src/modules/payments/application/payments.service.js';
import type { FakePaymentProvider } from '../src/modules/payments/infrastructure/fake.provider.js';
import { signWebhook } from '../src/modules/payments/infrastructure/hmac-webhook.verifier.js';
import { PAYMENT_PROVIDER } from '../src/modules/payments/payments.module.js';
import { loadEnv } from '../src/shared/config/env.js';

/**
 * Payments integration tests against the real Postgres + Redis from infra/docker-compose.yml,
 * using a dedicated database (delyva_payments_test). They SKIP with a message when unreachable.
 */
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ?? 'postgres://delyva:delyva_local_only@127.0.0.1:55432/delyva';
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, '/delyva_payments_test');
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/14';
const SECRET = 'payments-integration-webhook-secret';
const JOBS_TOKEN = 'integration-internal-jobs-token-0123456789';

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
  process.stderr.write('\n[SKIP] payments integration tests: Postgres/Redis not reachable.\n\n');
}

type Body = Record<string, unknown>;
const b = (r: request.Response): Body => r.body as Body;
const ngn = (minor: number): Money => Money.ofMinor(minor, 'NGN');

describe.skipIf(!available)('payments (integration: Postgres + Redis)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let http: ReturnType<typeof request>;
  let fake: FakePaymentProvider;
  let payments: PaymentsService;
  let signer: JoseAccessTokenSigner;
  let eventSeq = 1000;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('DROP DATABASE IF EXISTS delyva_payments_test WITH (FORCE)');
    await admin.query('CREATE DATABASE delyva_payments_test');
    await admin.end();
    await runMigrations(DB_URL, fileURLToPath(new URL('../drizzle', import.meta.url)));
    const redis = new Redis(REDIS_URL);
    await redis.flushdb();
    redis.disconnect();
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
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_FAKE_WEBHOOK_SECRET: SECRET,
      INTERNAL_JOBS_TOKEN: JOBS_TOKEN,
      PAYOUT_MIN_MINOR: '1000',
    });
    ({ app } = await createApp(env));
    await app.init();
    http = request(app.getHttpServer() as Parameters<typeof request>[0]);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    payments = app.get(PaymentsService);
    signer = app.get(JoseAccessTokenSigner);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const tokenFor = async (userId: string): Promise<string> =>
    (await signer.sign({ userId, roles: ['customer'], deviceId: 'device-int-1' })).token;

  const webhook = (payload: object, signWith = SECRET) => {
    const raw = JSON.stringify(payload);
    return http
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', signWebhook(raw, signWith))
      .send(raw);
  };

  /** Tops up a wallet through intent + signed webhook; returns the intent body. */
  async function topUp(userId: string, amountMinor: number): Promise<Body> {
    const res = await http
      .post('/v1/wallet/top-ups')
      .set('authorization', `Bearer ${await tokenFor(userId)}`)
      .set('Idempotency-Key', `topup-${randomUUID()}`)
      .send({ amountMinor, method: 'card' })
      .expect(201);
    eventSeq += 1;
    await webhook({
      event: 'charge.success',
      data: { id: eventSeq, reference: b(res).reference },
    }).expect(200);
    return b(res);
  }

  const walletOf = async (userId: string): Promise<Body> =>
    b(
      await http
        .get('/v1/wallet')
        .set('authorization', `Bearer ${await tokenFor(userId)}`)
        .expect(200),
    );

  it('rejects wallet reads without a valid bearer token', async () => {
    const r = await http.get('/v1/wallet').expect(401);
    expect(b(r).code).toBe('unauthorized');
    await http.get('/v1/wallet').set('authorization', 'Bearer a.b.c').expect(401);
  });

  it('tops up via signed webhook, dedupes replays and rejects bad signatures', async () => {
    const user = randomUUID();
    const res = await http
      .post('/v1/wallet/top-ups')
      .set('authorization', `Bearer ${await tokenFor(user)}`)
      .set('Idempotency-Key', 'topup-key-0001')
      .send({ amountMinor: 25_000, method: 'card' })
      .expect(201);
    expect(b(res)).toMatchObject({ status: 'requires_action', purpose: 'wallet_top_up' });
    const event = { event: 'charge.success', data: { id: 1, reference: b(res).reference } };

    const bad = await webhook(event, 'wrong-secret').expect(401);
    expect(b(bad).code).toBe('unauthorized');
    expect(await walletOf(user)).toMatchObject({ balance: { amountMinor: 0, currency: 'NGN' } });

    expect(b(await webhook(event).expect(200))).toEqual({ received: true, duplicate: false });
    expect(b(await webhook(event).expect(200))).toEqual({ received: true, duplicate: true });
    expect(await walletOf(user)).toEqual({
      balance: { amountMinor: 25_000, currency: 'NGN' },
      held: { amountMinor: 0, currency: 'NGN' },
      available: { amountMinor: 25_000, currency: 'NGN' },
    });
    const intent = await http
      .get(`/v1/payment-intents/${String(b(res).id)}`)
      .set('authorization', `Bearer ${await tokenFor(user)}`)
      .expect(200);
    expect(b(intent).status).toBe('succeeded');
  });

  it('rejects webhooks without a signature header or with a malformed body', async () => {
    await http
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(401);
    const raw = '{"event":"charge.success","data":{}}';
    await http
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', signWebhook(raw, SECRET))
      .send(raw)
      .expect(400);
  });

  it('prevents IDOR: user B cannot read or verify user A intents and sees only their own wallet', async () => {
    const a = randomUUID();
    const bUser = randomUUID();
    const intent = await topUp(a, 12_345);
    const tokenB = `Bearer ${await tokenFor(bUser)}`;
    await http
      .get(`/v1/payment-intents/${String(intent.id)}`)
      .set('authorization', tokenB)
      .expect(404);
    await http
      .post(`/v1/payment-intents/${String(intent.id)}/verify`)
      .set('authorization', tokenB)
      .set('Idempotency-Key', 'verify-idor-0001')
      .expect(404);
    await http.get('/v1/payment-intents/not-a-uuid').set('authorization', tokenB).expect(404);
    expect((await walletOf(bUser)).balance).toEqual({ amountMinor: 0, currency: 'NGN' });
    const txB = await http.get('/v1/wallet/transactions').set('authorization', tokenB).expect(200);
    expect(b(txB).items).toEqual([]);
  });

  it('settles through the server-side verify call and fails on amount mismatch', async () => {
    const user = randomUUID();
    const auth = `Bearer ${await tokenFor(user)}`;
    const ok = await http
      .post('/v1/wallet/top-ups')
      .set('authorization', auth)
      .set('Idempotency-Key', 'topup-verify-01')
      .send({ amountMinor: 10_000, method: 'transfer' })
      .expect(201);
    fake.setOutcome(String(b(ok).reference), 'pending');
    const pending = await http
      .post(`/v1/payment-intents/${String(b(ok).id)}/verify`)
      .set('authorization', auth)
      .set('Idempotency-Key', 'verify-0000001')
      .expect(200);
    expect(b(pending).status).toBe('processing');
    fake.setOutcome(String(b(ok).reference), 'success');
    const done = await http
      .post(`/v1/payment-intents/${String(b(ok).id)}/verify`)
      .set('authorization', auth)
      .set('Idempotency-Key', 'verify-0000002')
      .expect(200);
    expect(b(done).status).toBe('succeeded');

    const bad = await http
      .post('/v1/wallet/top-ups')
      .set('authorization', auth)
      .set('Idempotency-Key', 'topup-verify-02')
      .send({ amountMinor: 10_000, method: 'card' })
      .expect(201);
    fake.setOutcome(String(b(bad).reference), 'success', ngn(100));
    const failed = await http
      .post(`/v1/payment-intents/${String(b(bad).id)}/verify`)
      .set('authorization', auth)
      .set('Idempotency-Key', 'verify-0000003')
      .expect(200);
    expect(b(failed).status).toBe('failed');
    expect((await walletOf(user)).balance).toEqual({ amountMinor: 10_000, currency: 'NGN' });
    const events = await pool.query(
      "SELECT count(*)::int AS n FROM outbox_events WHERE type = 'payments.intent.failed'",
    );
    expect((events.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });

  it('lists wallet movements newest first with a cursor', async () => {
    const user = randomUUID();
    await topUp(user, 10_000);
    await topUp(user, 20_000);
    const auth = `Bearer ${await tokenFor(user)}`;
    const p1 = await http
      .get('/v1/wallet/transactions?limit=1')
      .set('authorization', auth)
      .expect(200);
    expect(b(p1).items).toMatchObject([{ kind: 'wallet_top_up', amount: { amountMinor: 20_000 } }]);
    const p2 = await http
      .get(`/v1/wallet/transactions?limit=1&cursor=${String(b(p1).nextCursor)}`)
      .set('authorization', auth)
      .expect(200);
    expect(b(p2)).toMatchObject({ items: [{ amount: { amountMinor: 10_000 } }], nextCursor: null });
    await http.get('/v1/wallet/transactions?limit=0').set('authorization', auth).expect(400);
  });

  it('does not let two concurrent holds overspend a wallet', async () => {
    const user = randomUUID();
    await topUp(user, 10_000);
    const results = await Promise.allSettled([
      payments.createIntentForOrder({
        orderId: `ord-${randomUUID()}`,
        userId: user,
        amount: ngn(7_000),
        method: 'wallet',
      }),
      payments.createIntentForOrder({
        orderId: `ord-${randomUUID()}`,
        userId: user,
        amount: ngn(7_000),
        method: 'wallet',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const reasons = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []));
    expect(reasons).toEqual([expect.stringMatching(/Insufficient/)]);
    expect(await walletOf(user)).toMatchObject({
      held: { amountMinor: 7_000 },
      available: { amountMinor: 3_000 },
    });
  });

  it('captures an order split, refunds partially then fully, and keeps every kobo', async () => {
    const user = randomUUID();
    const vendor = `ven-${randomUUID()}`;
    const orderId = `ord-${randomUUID()}`;
    await topUp(user, 20_000);
    const intent = await payments.createIntentForOrder({
      orderId,
      userId: user,
      amount: ngn(10_000),
      method: 'wallet',
    });
    expect(intent.status).toBe('succeeded');
    const again = await payments.createIntentForOrder({
      orderId,
      userId: user,
      amount: ngn(10_000),
      method: 'wallet',
    });
    expect(again.id).toBe(intent.id);
    const split = {
      customerUserId: user,
      vendorId: vendor,
      riderId: 'rider-1',
      customerPaid: ngn(10_000),
      vendor: ngn(7_001),
      rider: ngn(1_500),
      platformFee: ngn(1_000),
      tax: ngn(999),
      promo: ngn(500),
    };
    const cap = await payments.captureOrderSplit(orderId, split);
    expect((await payments.captureOrderSplit(orderId, split)).transactionId).toBe(
      cap.transactionId,
    );
    expect(await walletOf(user)).toMatchObject({
      balance: { amountMinor: 10_000 },
      held: { amountMinor: 0 },
    });

    await payments.refundOrder({
      orderId,
      amount: ngn(3_333),
      destination: 'wallet',
      reason: 'missing item',
    });
    await expect(
      payments.refundOrder({
        orderId,
        amount: ngn(10_000),
        destination: 'wallet',
        reason: 'too much',
      }),
    ).rejects.toThrow(/exceeds/);
    await payments.refundOrder({ orderId, destination: 'wallet', reason: 'cancelled' });
    expect((await walletOf(user)).balance).toEqual({ amountMinor: 20_000, currency: 'NGN' });

    const order = await pool.query(
      `SELECT a.code, sum(e.amount_minor)::bigint AS s FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.transaction_id JOIN ledger_accounts a ON a.id = e.account_id
       WHERE t.reference = $1 GROUP BY a.code`,
      [orderId],
    );
    for (const row of order.rows as { code: string; s: string }[]) expect(Number(row.s)).toBe(0);
    const refunded = await pool.query(
      "SELECT count(*)::int AS n FROM outbox_events WHERE type = 'payments.refund.completed' AND aggregate_id = $1",
      [orderId],
    );
    expect((refunded.rows[0] as { n: number }).n).toBe(2);
  });

  it('pays an order by card, holds on verified success, and refunds to source', async () => {
    const user = randomUUID();
    const orderId = `ord-${randomUUID()}`;
    const intent = await payments.createIntentForOrder({
      orderId,
      userId: user,
      amount: ngn(5_000),
      method: 'card',
    });
    expect(intent.status).toBe('requires_action');
    await webhook({
      event: 'charge.success',
      data: { id: 777_001, reference: intent.reference },
    }).expect(200);
    expect(await walletOf(user)).toMatchObject({
      balance: { amountMinor: 5_000 },
      held: { amountMinor: 5_000 },
    });
    await payments.captureOrderSplit(orderId, {
      customerUserId: user,
      vendorId: 'v-card',
      riderId: null,
      customerPaid: ngn(5_000),
      vendor: ngn(4_000),
      rider: ngn(0),
      platformFee: ngn(1_000),
      tax: ngn(0),
      promo: ngn(0),
    });
    await payments.refundOrder({ orderId, destination: 'source', reason: 'vendor cancelled' });
    expect(
      fake.calls.filter((c) => c.op === 'refund' && c.reference === intent.reference),
    ).toHaveLength(1);
    expect((await walletOf(user)).balance).toMatchObject({ amountMinor: 0 });
    const row = await pool.query('SELECT status FROM payment_intents WHERE id = $1', [intent.id]);
    expect((row.rows[0] as { status: string }).status).toBe('refunded');
    await expect(payments.releaseOrderHold(orderId)).resolves.toEqual({ released: false });
  });

  it('releases holds and refuses capture of a released hold', async () => {
    const user = randomUUID();
    const orderId = `ord-${randomUUID()}`;
    await topUp(user, 10_000);
    await payments.createIntentForOrder({
      orderId,
      userId: user,
      amount: ngn(3_000),
      method: 'wallet',
    });
    await expect(payments.releaseOrderHold(orderId)).resolves.toEqual({ released: true });
    await expect(
      payments.captureOrderSplit(orderId, {
        customerUserId: user,
        vendorId: 'v',
        riderId: null,
        customerPaid: ngn(3_000),
        vendor: ngn(3_000),
        rider: ngn(0),
        platformFee: ngn(0),
        tax: ngn(0),
        promo: ngn(0),
      }),
    ).rejects.toThrow(/released/);
    await expect(
      payments.refundOrder({ orderId: 'never-captured', destination: 'wallet', reason: 'x' }),
    ).rejects.toThrow(/not been captured/);
  });

  it('enforces ledger immutability and balance at the database level', async () => {
    await expect(
      pool.query('UPDATE ledger_entries SET amount_minor = amount_minor + 1'),
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ledger_entries')).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ledger_transactions')).rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE ledger_entries CASCADE')).rejects.toThrow(/append-only/);
    const client = await pool.connect();
    try {
      const acct = await client.query(
        "SELECT id FROM ledger_accounts WHERE code = 'platform_revenue' LIMIT 1",
      );
      const accountId = (acct.rows[0] as { id: string }).id;
      const txn = randomUUID();
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO ledger_transactions (id, kind, idempotency_key, reference) VALUES ($1::uuid, 'reversal', $1::text, 'test')",
        [txn],
      );
      await client.query(
        "INSERT INTO ledger_entries (transaction_id, account_id, amount_minor, currency) VALUES ($1, $2, 100, 'NGN')",
        [txn, accountId],
      );
      await client.query(
        "INSERT INTO ledger_entries (transaction_id, account_id, amount_minor, currency) VALUES ($1, $2, -99, 'NGN')",
        [txn, accountId],
      );
      await expect(client.query('COMMIT')).rejects.toThrow(/unbalanced/);
      await client.query('BEGIN');
      const lone = randomUUID();
      await client.query(
        "INSERT INTO ledger_transactions (id, kind, idempotency_key, reference) VALUES ($1::uuid, 'reversal', $1::text, 'test')",
        [lone],
      );
      await expect(client.query('COMMIT')).rejects.toThrow(/at least 2/);
      await expect(
        client.query(
          "INSERT INTO ledger_entries (transaction_id, account_id, amount_minor, currency) VALUES ($1, $2, 0, 'NGN')",
          [randomUUID(), accountId],
        ),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
    const total = await pool.query(
      'SELECT currency, sum(amount_minor)::bigint AS s FROM ledger_entries GROUP BY currency',
    );
    for (const r of total.rows as { s: string }[]) expect(Number(r.s)).toBe(0);
  });

  it('runs an idempotent payout batch and applies transfer webhooks', async () => {
    await http.post('/internal/payments/payouts/run').send({ batchId: 'wk-0001' }).expect(403);
    const user = randomUUID();
    const vendorId = `vpay-${randomUUID()}`;
    const orderId = `ord-${randomUUID()}`;
    await topUp(user, 50_000);
    await payments.createIntentForOrder({
      orderId,
      userId: user,
      amount: ngn(50_000),
      method: 'wallet',
    });
    await payments.captureOrderSplit(orderId, {
      customerUserId: user,
      vendorId,
      riderId: null,
      customerPaid: ngn(50_000),
      vendor: ngn(45_000),
      rider: ngn(0),
      platformFee: ngn(5_000),
      tax: ngn(0),
      promo: ngn(0),
    });
    await pool.query(
      "INSERT INTO payout_recipients (account, recipient_code) VALUES ($1, 'RCP_test')",
      [`vendor_payable:${vendorId}`],
    );

    const run = (id: string) =>
      http
        .post('/internal/payments/payouts/run')
        .set('x-internal-token', JOBS_TOKEN)
        .send({ batchId: id })
        .expect(200);
    const first = b(await run('wk-0047'));
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(b(await run('wk-0047'))).toMatchObject({ sent: 0 });
    const payout = await pool.query('SELECT reference, status FROM payouts WHERE account = $1', [
      `vendor_payable:${vendorId}`,
    ]);
    const p = payout.rows[0] as { reference: string; status: string };
    expect(p.status).toBe('sent');
    await webhook({ event: 'transfer.success', data: { id: 5001, reference: p.reference } }).expect(
      200,
    );
    const after = await pool.query('SELECT status FROM payouts WHERE reference = $1', [
      p.reference,
    ]);
    expect((after.rows[0] as { status: string }).status).toBe('completed');
    const sent = await pool.query(
      "SELECT count(*)::int AS n FROM outbox_events WHERE type = 'payments.payout.sent'",
    );
    expect((sent.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });

  it('reverses a failed payout and skips payees without recipients or failing transfers', async () => {
    const user = randomUUID();
    const vendorId = `vfail-${randomUUID()}`;
    const orderId = `ord-${randomUUID()}`;
    await topUp(user, 20_000);
    await payments.createIntentForOrder({
      orderId,
      userId: user,
      amount: ngn(20_000),
      method: 'wallet',
    });
    await payments.captureOrderSplit(orderId, {
      customerUserId: user,
      vendorId,
      riderId: null,
      customerPaid: ngn(20_000),
      vendor: ngn(20_000),
      rider: ngn(0),
      platformFee: ngn(0),
      tax: ngn(0),
      promo: ngn(0),
    });
    const report = b(
      await http
        .post('/internal/payments/payouts/run')
        .set('x-internal-token', JOBS_TOKEN)
        .send({ batchId: 'wk-0048' })
        .expect(200),
    );
    expect(report.skipped).toBeGreaterThanOrEqual(1);

    await pool.query(
      "INSERT INTO payout_recipients (account, recipient_code) VALUES ($1, 'RCP_f')",
      [`vendor_payable:${vendorId}`],
    );
    fake.setTransfersFailing(true);
    const failing = b(
      await http
        .post('/internal/payments/payouts/run')
        .set('x-internal-token', JOBS_TOKEN)
        .send({ batchId: 'wk-0049' })
        .expect(200),
    );
    expect(failing.failed).toBeGreaterThanOrEqual(1);
    fake.setTransfersFailing(false);

    await http
      .post('/internal/payments/payouts/run')
      .set('x-internal-token', JOBS_TOKEN)
      .send({ batchId: 'wk-0050' })
      .expect(200);
    const row = await pool.query(
      "SELECT reference FROM payouts WHERE account = $1 AND status = 'sent'",
      [`vendor_payable:${vendorId}`],
    );
    const ref = (row.rows[0] as { reference: string }).reference;
    await webhook({ event: 'transfer.failed', data: { id: 6001, reference: ref } }).expect(200);
    const bal = await pool.query(
      `SELECT -sum(e.amount_minor)::bigint AS s FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE a.code = $1`,
      [`vendor_payable:${vendorId}`],
    );
    expect(Number((bal.rows[0] as { s: string }).s)).toBe(20_000);
  });

  it('reconciles provider charges against the ledger and emits a mismatch event', async () => {
    const user = randomUUID();
    await http
      .post('/v1/wallet/top-ups')
      .set('authorization', `Bearer ${await tokenFor(user)}`)
      .set('Idempotency-Key', 'topup-recon-001')
      .send({ amountMinor: 10_000, method: 'card' })
      .expect(201);
    const today = new Date().toISOString().slice(0, 10);
    const r = await http
      .post('/internal/payments/reconciliations/run')
      .set('x-internal-token', JOBS_TOKEN)
      .send({ date: today })
      .expect(200);
    expect(Number(b(r).mismatches)).toBeGreaterThanOrEqual(1);
    const ev = await pool.query(
      "SELECT count(*)::int AS n FROM outbox_events WHERE type = 'payments.reconciliation.mismatched'",
    );
    expect((ev.rows[0] as { n: number }).n).toBe(1);
  });
});
