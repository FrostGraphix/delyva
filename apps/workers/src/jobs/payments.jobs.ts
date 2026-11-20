import {
  INTERNAL_PAYMENT_PATHS,
  RunPayoutBatchRequestSchema,
  RunReconciliationRequestSchema,
} from '@delyva/contracts';

/** Payments queues consumed by this worker process. */
export const PAYMENT_QUEUES = {
  payouts: 'payments-payouts',
  reconciliation: 'payments-reconciliation',
} as const;

/** Cron schedules (Africa/Lagos): weekly payouts Monday 02:00, nightly reconciliation 03:00. */
export const PAYMENT_SCHEDULES = {
  payouts: { pattern: '0 2 * * 1', tz: 'Africa/Lagos' },
  reconciliation: { pattern: '0 3 * * *', tz: 'Africa/Lagos' },
} as const;

/** Port to the API's internal job endpoints; the ledger stays owned by the API's payments module. */
export interface InternalPaymentsApi {
  /** POSTs a JSON body to an internal path and returns the parsed JSON response. */
  post(path: string, body: unknown): Promise<unknown>;
}

/** ISO week id used as the payout batch id, e.g. `2026-w47` (idempotent per week). */
export function isoWeekBatchId(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${String(d.getUTCFullYear())}-w${String(week).padStart(2, '0')}`;
}

/** Previous UTC day as YYYY-MM-DD (nightly reconciliation target). */
export function previousUtcDay(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Runs the weekly vendor payout batch. A re-run in the same week is a no-op at the API. */
export async function processPayoutBatch(now: Date, api: InternalPaymentsApi): Promise<unknown> {
  const body = RunPayoutBatchRequestSchema.parse({ batchId: isoWeekBatchId(now) });
  return api.post(INTERNAL_PAYMENT_PATHS.runPayouts, body);
}

/** Runs reconciliation for the previous UTC day. */
export async function processReconciliation(now: Date, api: InternalPaymentsApi): Promise<unknown> {
  const body = RunReconciliationRequestSchema.parse({ date: previousUtcDay(now) });
  return api.post(INTERNAL_PAYMENT_PATHS.runReconciliation, body);
}

/** fetch-based {@link InternalPaymentsApi} with a shared token and timeout. */
export function httpInternalApi(
  baseUrl: string,
  token: string,
  timeoutMs = 120_000,
): InternalPaymentsApi {
  return {
    async post(path, body) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`internal payments call failed with ${String(res.status)}`);
      return res.json();
    },
  };
}
