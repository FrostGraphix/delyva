import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** True while the device has a connection (driven by NetInfo through TanStack's onlineManager). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
