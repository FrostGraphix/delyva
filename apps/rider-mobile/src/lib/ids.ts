import { randomUUID } from 'expo-crypto';

/** New random UUID v4 (idempotency keys, device id). */
export function newId(): string {
  return randomUUID();
}
