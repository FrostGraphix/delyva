import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Trip } from '@delyva/contracts';
import type { TripActionBodies, TripActionSegment } from '@delyva/sdk';
import { create } from 'zustand';
import { api } from '../api/client';
import { newId } from '../lib/ids';
import { type ReplayResult, TripActionQueue } from './trip-queue';

/** UI-visible queue state. */
interface QueueStatus {
  readonly pending: number;
  readonly lastRejected: unknown;
}

/** Pending trip-action count for banners. */
export const useQueueStatus = create<QueueStatus>(() => ({ pending: 0, lastRejected: null }));

// DEBT(storage): AsyncStorage instead of MMKV — MMKV needs a dev build (not Expo Go / web) — switch once EAS dev builds exist; the queue holds no secrets.
const queue = new TripActionQueue(AsyncStorage, (a) =>
  api.tripAction(a.tripId, a.action, a.body, a.id),
);

async function sync(result?: ReplayResult): Promise<void> {
  const pending = (await queue.list()).length;
  const lastRejected = result?.rejected[0]?.error ?? null;
  useQueueStatus.setState({ pending, lastRejected });
}

/** Replays queued actions (call on reconnect and on app start). */
export async function replayTripActions(): Promise<ReplayResult> {
  const result = await queue.replay();
  await sync(result);
  return result;
}

/** Result of {@link performTripAction}. */
export type TripActionOutcome =
  | { readonly kind: 'sent'; readonly trip: Trip }
  | { readonly kind: 'queued' }
  | { readonly kind: 'rejected'; readonly error: unknown };

/**
 * Persists the action with a fresh Idempotency-Key, then tries to send the whole queue. Offline
 * the action stays queued and is replayed later with the same key.
 */
export async function performTripAction<S extends TripActionSegment>(
  tripId: string,
  action: S,
  body: TripActionBodies[S],
): Promise<TripActionOutcome> {
  const id = newId();
  await queue.enqueue({ id, tripId, action, body, queuedAt: Date.now() });
  const result = await replayTripActions();
  const sent = result.sent.find((s) => s.action.id === id);
  if (sent) return { kind: 'sent', trip: sent.trip };
  const rejected = result.rejected.find((r) => r.action.id === id);
  if (rejected) return { kind: 'rejected', error: rejected.error };
  return { kind: 'queued' };
}
