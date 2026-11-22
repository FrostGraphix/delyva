import { ApiError } from '@delyva/sdk';

/** Stable problem code of an API error, or null for network/timeouts/unknown errors. */
export function problemCode(err: unknown): string | null {
  return err instanceof ApiError ? err.problem.code : null;
}

/** HTTP status of an API error, or null. */
export function problemStatus(err: unknown): number | null {
  return err instanceof ApiError ? err.problem.status : null;
}

/**
 * True when the request may succeed if retried later: no HTTP response at all (offline,
 * timeout, DNS), 408/429, or a 5xx. 4xx answers are final.
 */
export function isRetryable(err: unknown): boolean {
  const status = problemStatus(err);
  if (status === null) return true;
  return status === 408 || status === 429 || status >= 500;
}
