import { describe, expect, it } from 'vitest';
import { HandleProviderWebhook } from './handle-webhook.use-case.js';
import { PayoutTransitions } from './payouts.use-cases.js';
import type { PaymentProvider, PaymentsStore, WebhookVerifier } from './ports.js';

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const unused = new Proxy({}, { get: () => () => Promise.reject(new Error('not expected')) });

function handler(allowedIps: string[], verifier: Partial<WebhookVerifier>): HandleProviderWebhook {
  return new HandleProviderWebhook({
    store: unused as PaymentsStore,
    provider: { name: 'fake' } as PaymentProvider,
    verifier: { verifySignature: () => true, parse: () => null, ...verifier },
    clock: { now: () => new Date(0), uuid: () => '00000000-0000-4000-8000-000000000000' },
    logger,
    payouts: new PayoutTransitions(),
    allowedIps,
  });
}

describe('HandleProviderWebhook guards', () => {
  const input = { rawBody: Buffer.from('{}'), signature: 'sig', ip: '10.0.0.9' };

  it('rejects sources outside the IP allowlist before checking the signature', async () => {
    let checked = false;
    const h = handler(['52.31.139.75'], { verifySignature: () => ((checked = true), true) });
    await expect(h.execute(input)).rejects.toMatchObject({ code: 'forbidden' });
    expect(checked).toBe(false);
  });

  it('rejects an invalid signature and a malformed body', async () => {
    await expect(
      handler([], { verifySignature: () => false }).execute(input),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(handler(['10.0.0.9'], {}).execute(input)).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });
});
