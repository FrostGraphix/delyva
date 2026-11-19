import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** Per-request context propagated through async calls. */
export interface RequestContext {
  readonly traceId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` inside a request context. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Current trace id, if inside a request. */
export function currentTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;
const SAFE_ID = /^[\w-]{8,64}$/;

/**
 * Derives a trace id from W3C `traceparent` or `x-request-id`, else generates one.
 * Untrusted header values are accepted only if they match a strict pattern.
 */
export function resolveTraceId(traceparent?: string, requestId?: string): string {
  const fromParent = traceparent ? TRACEPARENT.exec(traceparent)?.[1] : undefined;
  if (fromParent) return fromParent;
  if (requestId && SAFE_ID.test(requestId)) return requestId;
  return randomUUID().replaceAll('-', '');
}
