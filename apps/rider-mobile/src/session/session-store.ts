import type { Role, TokenPair } from '@delyva/contracts';
import { create } from 'zustand';
import { newId } from '../lib/ids';
import { rolesFromAccessToken } from '../lib/jwt';
import { secretStorage } from './secure-storage';

const KEY_REFRESH = 'delyva.rider.refresh';
const KEY_ACCESS = 'delyva.rider.access';
const KEY_DEVICE = 'delyva.rider.device';
const KEY_USER = 'delyva.rider.user';

/** Session lifecycle. */
export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

/** Session state (tokens live in memory; persisted only to secure storage). */
export interface SessionState {
  readonly status: SessionStatus;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly userId: string | null;
  readonly roles: readonly Role[];
  readonly deviceId: string | null;
  /** Loads tokens and the device id from secure storage. */
  readonly hydrate: () => Promise<void>;
  /** Stores a new token pair (sign-in or refresh). */
  readonly setTokens: (pair: TokenPair) => Promise<void>;
  /** Clears tokens (keeps the device id). */
  readonly signOut: () => Promise<void>;
}

async function loadDeviceId(): Promise<string> {
  const existing = await secretStorage.get(KEY_DEVICE);
  if (existing) return existing;
  const id = `rider-${newId()}`;
  await secretStorage.set(KEY_DEVICE, id);
  return id;
}

/** Global session store. */
export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  accessToken: null,
  refreshToken: null,
  userId: null,
  roles: [],
  deviceId: null,
  hydrate: async () => {
    const [deviceId, refreshToken, accessToken, userId] = await Promise.all([
      loadDeviceId(),
      secretStorage.get(KEY_REFRESH),
      secretStorage.get(KEY_ACCESS),
      secretStorage.get(KEY_USER),
    ]);
    const signedIn = refreshToken !== null && accessToken !== null;
    set({
      deviceId,
      refreshToken,
      accessToken,
      userId,
      roles: accessToken ? rolesFromAccessToken(accessToken) : [],
      status: signedIn ? 'signedIn' : 'signedOut',
    });
  },
  setTokens: async (pair) => {
    await Promise.all([
      secretStorage.set(KEY_REFRESH, pair.refreshToken),
      secretStorage.set(KEY_ACCESS, pair.accessToken),
      secretStorage.set(KEY_USER, pair.userId),
    ]);
    set({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      userId: pair.userId,
      roles: rolesFromAccessToken(pair.accessToken),
      status: 'signedIn',
    });
  },
  signOut: async () => {
    await Promise.all([KEY_REFRESH, KEY_ACCESS, KEY_USER].map((k) => secretStorage.remove(k)));
    set({ accessToken: null, refreshToken: null, userId: null, roles: [], status: 'signedOut' });
  },
}));

/** True when the current access token carries the `rider` role. */
export function isRider(roles: readonly Role[]): boolean {
  return roles.includes('rider');
}
