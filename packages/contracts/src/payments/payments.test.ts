import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../openapi.js';
import {
  CreateTopUpRequestSchema,
  MoneyDtoSchema,
  WalletTransactionsQuerySchema,
} from './payments.js';

interface Op {
  parameters?: { name: string; in: string }[];
}

describe('payments contracts', () => {
  it('rejects fractional kobo amounts', () => {
    expect(MoneyDtoSchema.safeParse({ amountMinor: 10.5, currency: 'NGN' }).success).toBe(false);
    expect(MoneyDtoSchema.safeParse({ amountMinor: 1050, currency: 'NGN' }).success).toBe(true);
  });

  it('bounds top-ups and rejects unknown fields', () => {
    expect(CreateTopUpRequestSchema.safeParse({ amountMinor: 9_999, method: 'card' }).success).toBe(
      false,
    );
    expect(
      CreateTopUpRequestSchema.safeParse({ amountMinor: 10_000, method: 'card', userId: 'x' })
        .success,
    ).toBe(false);
    expect(
      CreateTopUpRequestSchema.safeParse({ amountMinor: 10_000, method: 'wallet' }).success,
    ).toBe(false);
  });

  it('coerces and caps the transactions page size', () => {
    expect(WalletTransactionsQuerySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(WalletTransactionsQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('registers payments routes with path params and idempotency headers', () => {
    const doc = buildOpenApiDocument('0.0.0') as { paths: Record<string, Record<string, Op>> };
    const verify = doc.paths['/v1/payment-intents/{id}/verify']?.post;
    expect(verify?.parameters?.map((p) => `${p.in}:${p.name}`)).toEqual([
      'path:id',
      'header:Idempotency-Key',
    ]);
    expect(doc.paths['/v1/wallet']?.get).toBeDefined();
    expect(doc.paths['/v1/webhooks/paystack']?.post).toBeDefined();
  });
});
