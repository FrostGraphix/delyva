/** Minimal async key-value contract for secrets (tokens, device id). */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const memory = new Map<string, string>();

/**
 * Web build: secrets are kept in memory only (lost on reload) — never in localStorage.
 * Native builds resolve `secure-storage.native.ts` (expo-secure-store) instead.
 * DEBT(auth-web): web tokens are memory-only — browsers have no Keychain — move the web build to httpOnly cookie sessions like vendor/admin web.
 */
export const secureStorage: SecureStorage = {
  get: (key) => Promise.resolve(memory.get(key) ?? null),
  set: (key, value) => {
    memory.set(key, value);
    return Promise.resolve();
  },
  remove: (key) => {
    memory.delete(key);
    return Promise.resolve();
  },
};
