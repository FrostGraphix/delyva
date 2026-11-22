import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Minimal async key-value port for secrets (tokens, device id). */
export interface SecretStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Keychain / Keystore through expo-secure-store (native). */
const nativeStorage: SecretStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

// DEBT(security): the web build keeps tokens in sessionStorage — the web target exists only for E2E clicks, not as a shipped surface — ship web only behind httpOnly cookies (vendor/admin pattern).
interface WebStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
const session = (): WebStorage =>
  (globalThis as unknown as { sessionStorage: WebStorage }).sessionStorage;

const webStorage: SecretStorage = {
  get: (key) => Promise.resolve(session().getItem(key)),
  set: (key, value) => {
    session().setItem(key, value);
    return Promise.resolve();
  },
  remove: (key) => {
    session().removeItem(key);
    return Promise.resolve();
  },
};

/** Secret storage for the current platform. */
export const secretStorage: SecretStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
