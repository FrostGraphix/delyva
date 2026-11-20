import { describe, expect, it } from 'vitest';
import { ApiError } from './client.js';
import { PaymentsClient, paymentsKeys } from './payments.js';

const intent = {
  id: '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
  purpose: 'wallet_top_up',
  orderId: null,
  amount: { amountMinor: 10_000, currency: 'NGN' },
  method: 'card',
  status: 'requires_action',
  reference: 'dlv-x',
  authorizationUrl: 'https://c/x',
  createdAt: '2026-11-19T00:00:00.000Z',
};

function client(status: number, body: unknown, seen: { url: string; init?: RequestInit }[]) {
  return new PaymentsClient({
    baseUrl: 'https://api.test',
    accessToken: () => 'tok',
    idempotencyKey: () => 'idem-key-1',
    fetch: (input, init) => {
      seen.push({ url: input as string, init });
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    },
  });
}

describe('PaymentsClient', () => {
  it('sends bearer + idempotency headers and validates responses', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const out = await client(201, intent, seen).createWalletTopUp({
      amountMinor: 10_000,
      method: 'card',
    });
    expect(out.status).toBe('requires_action');
    const h = seen[0]?.init?.headers as Record<string, string>;
    expect(h.authorization).toBe('Bearer tok');
    expect(h['Idempotency-Key']).toBe('idem-key-1');
  });

  it('builds paths for intents, wallet and transactions', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await client(200, intent, seen).verifyPaymentIntent(intent.id);
    await client(200, intent, seen).getPaymentIntent(intent.id);
    const wallet = { amountMinor: 0, currency: 'NGN' };
    await client(200, { balance: wallet, held: wallet, available: wallet }, seen).getWallet();
    await client(200, { items: [], nextCursor: null }, seen).listWalletTransactions({
      limit: 5,
      cursor: '9',
    });
    await client(200, { items: [], nextCursor: null }, seen).listWalletTransactions();
    expect(seen.map((s) => s.url)).toEqual([
      `https://api.test/v1/payment-intents/${intent.id}/verify`,
      `https://api.test/v1/payment-intents/${intent.id}`,
      'https://api.test/v1/wallet',
      'https://api.test/v1/wallet/transactions?limit=5&cursor=9',
      'https://api.test/v1/wallet/transactions',
    ]);
    expect(paymentsKeys.intent('a')).toEqual(['payments', 'intent', 'a']);
  });

  it('throws ApiError with the problem body, or a fallback', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'unauthorized',
    };
    await expect(client(401, problem, []).getWallet()).rejects.toBeInstanceOf(ApiError);
    await expect(client(500, 'x', []).getWallet()).rejects.toMatchObject({
      problem: { code: 'internal_error' },
    });
  });
});
