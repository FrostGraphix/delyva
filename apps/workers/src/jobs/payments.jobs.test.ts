import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  httpInternalApi,
  isoWeekBatchId,
  previousUtcDay,
  processPayoutBatch,
  processReconciliation,
} from './payments.jobs.js';

describe('payments jobs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('derives deterministic ISO-week batch ids and previous days', () => {
    expect(isoWeekBatchId(new Date('2026-11-16T01:00:00Z'))).toBe('2026-w47');
    expect(isoWeekBatchId(new Date('2026-11-22T23:00:00Z'))).toBe('2026-w47');
    expect(isoWeekBatchId(new Date('2027-01-01T00:00:00Z'))).toBe('2026-w53');
    expect(previousUtcDay(new Date('2026-11-20T02:00:00Z'))).toBe('2026-11-19');
  });

  it('calls the internal endpoints with validated bodies', async () => {
    const calls: [string, unknown][] = [];
    const api = {
      post: (p: string, b: unknown) => (calls.push([p, b]), Promise.resolve({ ok: true })),
    };
    const now = new Date('2026-11-16T01:00:00Z');
    await processPayoutBatch(now, api);
    await processReconciliation(now, api);
    expect(calls).toEqual([
      ['/internal/payments/payouts/run', { batchId: '2026-w47' }],
      ['/internal/payments/reconciliations/run', { date: '2026-11-15' }],
    ]);
  });

  it('sends the shared token and fails the job on non-2xx', async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal('fetch', (_: string, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response('{"sent":1}', { status: seen.length === 1 ? 200 : 403 }));
    });
    const api = httpInternalApi('http://api.test', 'tok');
    await expect(api.post('/x', {})).resolves.toEqual({ sent: 1 });
    expect((seen[0]?.headers as Record<string, string>)['x-internal-token']).toBe('tok');
    await expect(api.post('/x', {})).rejects.toThrow(/403/);
  });
});
