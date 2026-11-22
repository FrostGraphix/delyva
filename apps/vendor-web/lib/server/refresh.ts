import { type TokenPair, TokenPairSchema } from '@delyva/contracts';

const DEDUPE_WINDOW_MS = 15_000;
const inflight = new Map<string, { at: number; pair: Promise<TokenPair | null> }>();

/**
 * Rotates a refresh token at most once per process for a given token. The API revokes the whole
 * token family when a used refresh token is replayed, so concurrent requests from one browser
 * (several tabs or parallel fetches) must share a single rotation.
 * DEBT(vendor-web): dedupe is per Next process — needs a Redis lock when the portal runs more than one replica — move to a shared store before horizontal scaling.
 */
export function refreshOnce(
  apiUrl: string,
  refreshToken: string,
  deviceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenPair | null> {
  const now = Date.now();
  for (const [k, v] of inflight) if (now - v.at > DEDUPE_WINDOW_MS) inflight.delete(k);
  const hit = inflight.get(refreshToken);
  if (hit) return hit.pair;
  const pair = fetchImpl(`${apiUrl}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken, deviceId }),
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (r) => (r.ok ? TokenPairSchema.parse(await r.json()) : null))
    .catch(() => null);
  inflight.set(refreshToken, { at: now, pair });
  return pair;
}
