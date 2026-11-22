import type { TokenPair } from '@delyva/contracts';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { secureStorage } from './secure-storage';

const KEY_REFRESH = 'delyva.refreshToken';
const KEY_USER = 'delyva.userId';
const KEY_DEVICE = 'delyva.deviceId';

/** Session lifecycle. */
export type SessionStatus = 'loading' | 'guest' | 'authed';

/** Session state. The short-lived access token is kept in memory only. */
export interface SessionState {
  readonly status: SessionStatus;
  readonly userId: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly deviceId: string | null;
  /** Loads the refresh token + device id from secure storage. */
  readonly hydrate: () => Promise<void>;
  /** Stores a freshly issued (or rotated) token pair. */
  readonly setTokens: (pair: TokenPair) => Promise<void>;
  /** Forgets every token on this device. */
  readonly clear: () => Promise<void>;
}

/** Global session store (UI state; server state lives in TanStack Query). */
export const useSession = create<SessionState>()((set, get) => ({
  status: 'loading',
  userId: null,
  accessToken: null,
  refreshToken: null,
  deviceId: null,
  hydrate: async () => {
    let deviceId = await secureStorage.get(KEY_DEVICE);
    if (!deviceId) {
      deviceId = randomUUID();
      await secureStorage.set(KEY_DEVICE, deviceId);
    }
    const [refreshToken, userId] = await Promise.all([
      secureStorage.get(KEY_REFRESH),
      secureStorage.get(KEY_USER),
    ]);
    set({
      deviceId,
      refreshToken,
      userId,
      // A refresh token alone is enough: the first API call rotates it into an access token.
      status: refreshToken ? 'authed' : 'guest',
    });
  },
  setTokens: async (pair) => {
    await Promise.all([
      secureStorage.set(KEY_REFRESH, pair.refreshToken),
      secureStorage.set(KEY_USER, pair.userId),
    ]);
    set({
      status: 'authed',
      userId: pair.userId,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      deviceId: get().deviceId,
    });
  },
  clear: async () => {
    await Promise.all([secureStorage.remove(KEY_REFRESH), secureStorage.remove(KEY_USER)]);
    set({ status: 'guest', userId: null, accessToken: null, refreshToken: null });
  },
}));
