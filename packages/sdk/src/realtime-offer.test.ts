import { describe, expect, it } from 'vitest';
import { RealtimeClient } from './realtime.js';

describe('RealtimeClient.onDispatchOffer', () => {
  it('subscribes to dispatch:offer and unsubscribes with the returned function', () => {
    // Arrange
    const handlers = new Map<string, (...a: unknown[]) => void>();
    const fake = {
      emit: () => undefined,
      on: (e: string, h: (...a: unknown[]) => void) => handlers.set(e, h),
      off: (e: string) => handlers.delete(e),
      disconnect: () => undefined,
    };
    const rc = new RealtimeClient({
      url: 'https://api.example.test',
      accessToken: () => 'tok',
      connect: (() => fake) as never,
    });
    const seen: unknown[] = [];
    // Act
    const off = rc.onDispatchOffer((o) => seen.push(o));
    handlers.get('dispatch:offer')?.({ id: 'offer-1' });
    off();
    // Assert
    expect(seen).toEqual([{ id: 'offer-1' }]);
    expect(handlers.has('dispatch:offer')).toBe(false);
  });
});
