import { DelyvaClient, type OrderingClient } from '@delyva/sdk';
import { useSession } from '../auth/session-store';
import { config } from '../config';

/** Unauthenticated client used only for the refresh call (avoids refresh recursion). */
const bare = new DelyvaClient({ baseUrl: config.apiUrl });

let inflight: Promise<string | null> | null = null;

/** Rotates the refresh token once (concurrent 401s share one call). Null = signed out. */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= (async () => {
    const { refreshToken, deviceId } = useSession.getState();
    if (!refreshToken || !deviceId) return null;
    try {
      const pair = await bare.refresh({ refreshToken, deviceId });
      await useSession.getState().setTokens(pair);
      return pair.accessToken;
    } catch {
      // Replayed or revoked family: the server revoked every token, so sign out locally.
      await useSession.getState().clear();
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function withAuth(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}

const isAuthRoute = (url: string): boolean => url.includes('/v1/auth/');

/**
 * fetch wrapper: gets an access token first when only a refresh token is known, and on a 401
 * refreshes once and replays the same request (same Idempotency-Key header, so writes stay safe).
 */
export const authedFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : input;
  const session = useSession.getState();
  if (!isAuthRoute(url) && session.refreshToken && !session.accessToken) {
    const token = await refreshAccessToken();
    if (token) return globalThis.fetch(input, withAuth(init, token));
  }
  const res = await globalThis.fetch(input, init);
  if (res.status !== 401 || isAuthRoute(url) || !useSession.getState().refreshToken) return res;
  const token = await refreshAccessToken();
  return token ? globalThis.fetch(input, withAuth(init, token)) : res;
};

/** The app's typed API client (all calls go through the SDK). */
export const api = new DelyvaClient({
  baseUrl: config.apiUrl,
  fetch: authedFetch,
  accessToken: () => useSession.getState().accessToken,
  timeoutMs: 15_000,
});

/** Ordering sub-client. */
export const ordering: OrderingClient = api.ordering;
