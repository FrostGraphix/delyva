import * as SecureStore from 'expo-secure-store';
import type { SecureStorage } from './secure-storage';

/** Keychain (iOS) / Keystore (Android) storage for tokens and the device id. */
export const secureStorage: SecureStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
