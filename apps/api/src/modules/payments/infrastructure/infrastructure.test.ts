import { Money } from '@delyva/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HmacSha512WebhookVerifier, signWebhook } from './hmac-webhook.verifier.js';
import { PaystackError, PaystackProvider, toCharge } from './paystack.provider.js';

const secret = 'sk_test_unit_only';
const body = Buffer.from(
  JSON.stringify({ event: 'charge.success', data: { id: 42, reference: 'dlv-1' } }),
);

describe('HmacSha512WebhookVerifier', () => {
  const v = new HmacSha512WebhookVerifier(secret);

  it('accepts a valid HMAC-SHA512 signature over the raw body', () => {
    expect(v.verifySignature(body, signWebhook(body, secret))).toBe(true);
  });

  it('rejects wrong, missing, malformed signatures and an empty secret', () => {
    expect(v.verifySignature(body, signWebhook(body, 'other'))).toBe(false);
    expect(v.verifySignature(body, undefined)).toBe(false);
    expect(v.verifySignature(body, 'abc')).toBe(false);
    expect(new HmacSha512WebhookVerifier('').verifySignature(body, signWebhook(body, ''))).toBe(
      false,
    );
    const tampered = Buffer.from(body.toString().replace('42', '43'));
    expect(v.verifySignature(tampered, signWebhook(body, secret))).toBe(false);
  });

  it('derives a dedupe id from event + data.id', () => {
    expect(v.parse(body)).toEqual({
      eventId: 'charge.success:42',
      type: 'charge.success',
      reference: 'dlv-1',
    });
    expect(v.parse(Buffer.from('not json'))).toBeNull();
    expect(v.parse(Buffer.from('{"event":"x","data":{}}'))).toBeNull();
    expect(v.parse(Buffer.from('{"nope":1}'))).toBeNull();
  });
});

describe('PaystackProvider (HTTP mocked; live Paystack is NOT exercised)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(status: number, json: unknown): { url: string; init: RequestInit }[] {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify(json), { status }));
    });
    return calls;
  }
  const p = new PaystackProvider({ secretKey: 'sk_test_x', baseUrl: 'https://paystack.test' });

  it('initialises with kobo amount, reference and bearer secret', async () => {
    const calls = stub(200, {
      status: true,
      message: 'ok',
      data: { authorization_url: 'https://c/x', access_code: 'a', reference: 'r1' },
    });
    const out = await p.initialize({
      reference: 'r1',
      amount: Money.ofMinor(10_000, 'NGN'),
      email: 'e@x.invalid',
      channels: ['card'],
      metadata: {},
    });
    expect(out).toEqual({ authorizationUrl: 'https://c/x', reference: 'r1' });
    expect(calls[0]?.url).toBe('https://paystack.test/transaction/initialize');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk_test_x',
    );
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      amount: 10_000,
      currency: 'NGN',
      channels: ['card'],
    });
  });

  it('verifies and normalises statuses', async () => {
    stub(200, {
      status: true,
      message: 'ok',
      data: { id: 9, status: 'success', reference: 'r1', amount: 500, currency: 'NGN' },
    });
    await expect(p.verify('r1')).resolves.toMatchObject({
      outcome: 'success',
      providerTransactionId: '9',
    });
    const d = { id: 1, reference: 'r', amount: 1, currency: 'NGN' };
    expect(toCharge({ ...d, status: 'abandoned' }).outcome).toBe('failed');
    expect(toCharge({ ...d, status: 'ongoing' }).outcome).toBe('pending');
  });

  it('maps refund, recipient, transfer and resolve calls', async () => {
    stub(200, { status: true, message: 'ok', data: { transaction: { id: 5 } } });
    await expect(p.refund({ reference: 'r', amount: Money.ofMinor(1, 'NGN') })).resolves.toEqual({
      providerRefundId: '5',
    });
    stub(200, { status: true, message: 'ok', data: { recipient_code: 'RCP_1' } });
    await expect(
      p.createTransferRecipient({
        name: 'n',
        accountNumber: '0001',
        bankCode: '058',
        currency: 'NGN',
      }),
    ).resolves.toEqual({ recipientCode: 'RCP_1' });
    stub(200, { status: true, message: 'ok', data: { transfer_code: 'TRF_1', status: 'pending' } });
    await expect(
      p.transfer({
        amount: Money.ofMinor(1, 'NGN'),
        recipientCode: 'RCP_1',
        reference: 'payout_x_y',
        reason: 'r',
      }),
    ).resolves.toEqual({ transferCode: 'TRF_1', status: 'pending' });
    const calls = stub(200, {
      status: true,
      message: 'ok',
      data: { account_number: '0001', account_name: 'A B', bank_id: 1 },
    });
    await expect(p.resolveBankAccount({ accountNumber: '0001', bankCode: '058' })).resolves.toEqual(
      { accountNumber: '0001', accountName: 'A B' },
    );
    expect(calls[0]?.url).toContain('/bank/resolve?account_number=0001&bank_code=058');
  });

  it('pages through successful transactions', async () => {
    stub(200, {
      status: true,
      message: 'ok',
      data: [{ id: 1, status: 'success', reference: 'a', amount: 3, currency: 'NGN' }],
      meta: { page: 1, pageCount: 1 },
    });
    const out = await p.listSuccessfulCharges({ from: new Date(0), to: new Date(1) });
    expect(out.map((c) => c.reference)).toEqual(['a']);
  });

  it('throws PaystackError on status:false, HTTP errors and unexpected shapes', async () => {
    stub(400, { status: false, message: 'bad' });
    await expect(p.verify('r')).rejects.toBeInstanceOf(PaystackError);
    stub(200, { status: true, message: 'ok', data: { unexpected: true } });
    await expect(p.verify('r')).rejects.toThrow(/Unexpected/);
  });
});
