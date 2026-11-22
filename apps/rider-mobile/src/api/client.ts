import { DelyvaClient } from '@delyva/sdk';
import { API_URL } from '../config';
import { newId } from '../lib/ids';
import { useSession } from '../session/session-store';
import { createAuthedFetch } from './authed-fetch';

const plainFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Unauthenticated client used only for token refresh. */
const refreshClient = new DelyvaClient({
  baseUrl: API_URL,
  fetch: plainFetch,
  idempotencyKey: newId,
});

/** Rotates the refresh token; signs out when the family is revoked or expired. */
export async function refreshSession(): Promise<string | null> {
  const { refreshToken, deviceId, setTokens, signOut } = useSession.getState();
  if (!refreshToken || !deviceId) return null;
  try {
    const pair = await refreshClient.refresh({ refreshToken, deviceId });
    await setTokens(pair);
    return pair.accessToken;
  } catch (err) {
    const status = (err as { problem?: { status?: number } }).problem?.status;
    if (status === 401 || status === 403) await signOut();
    return null;
  }
}

/** The app-wide SDK client (bearer from the session store, refresh-on-401). */
export const api = new DelyvaClient({
  baseUrl: API_URL,
  idempotencyKey: newId,
  accessToken: () => useSession.getState().accessToken,
  fetch: createAuthedFetch({
    fetch: plainFetch,
    accessToken: () => useSession.getState().accessToken,
    refresh: refreshSession,
  }),
});
