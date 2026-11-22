import type { Trip } from '@delyva/contracts';
import type { TripActionBodies, TripActionSegment } from '@delyva/sdk';
import { isRetryable } from '../api/errors';

/** One trip action waiting to reach the API. `id` doubles as its Idempotency-Key. */
export interface QueuedTripAction<S extends TripActionSegment = TripActionSegment> {
  readonly id: string;
  readonly tripId: string;
  readonly action: S;
  readonly body: TripActionBodies[S];
  readonly queuedAt: number;
}

/** Persistence port (AsyncStorage in the app, a Map in tests). */
export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Sends one action with its idempotency key. */
export type SendTripAction = (a: QueuedTripAction) => Promise<Trip>;

/** Outcome of a replay pass. */
export interface ReplayResult {
  /** Actions the API accepted, with the trip it returned. */
  readonly sent: readonly { action: QueuedTripAction; trip: Trip }[];
  /** Actions the API refused for good (4xx); removed from the queue. */
  readonly rejected: readonly { action: QueuedTripAction; error: unknown }[];
  /** Actions still waiting (network down or 5xx). */
  readonly remaining: number;
}

const STORAGE_KEY = 'delyva.rider.trip-queue.v1';

/**
 * Durable FIFO of trip actions (arrived, picked up, delivered…). Every action is persisted
 * before it is sent, and replayed in order with the same Idempotency-Key, so a retry after a
 * lost response can never apply twice.
 */
export class TripActionQueue {
  private chain: Promise<unknown> = Promise.resolve();

  /** @param storage persistence port @param send sender */
  constructor(
    private readonly storage: QueueStorage,
    private readonly send: SendTripAction,
  ) {}

  /** Current queue contents (oldest first). */
  async list(): Promise<QueuedTripAction[]> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as QueuedTripAction[];
    } catch {
      return [];
    }
  }

  /** Persists an action at the end of the queue. */
  enqueue(action: QueuedTripAction): Promise<void> {
    return this.serial(async () => {
      const items = await this.list();
      if (items.some((i) => i.id === action.id)) return;
      await this.write([...items, action]);
    });
  }

  /** Sends queued actions in order; stops at the first retryable failure. */
  replay(): Promise<ReplayResult> {
    return this.serial(() => this.replayNow());
  }

  private async replayNow(): Promise<ReplayResult> {
    const items = await this.list();
    const sent: { action: QueuedTripAction; trip: Trip }[] = [];
    const rejected: { action: QueuedTripAction; error: unknown }[] = [];
    let i = 0;
    for (; i < items.length; i++) {
      const action = items[i];
      if (action === undefined) break;
      try {
        sent.push({ action, trip: await this.send(action) });
      } catch (error) {
        if (isRetryable(error)) break;
        rejected.push({ action, error });
      }
      await this.write(items.slice(i + 1));
    }
    return { sent, rejected, remaining: items.length - i };
  }

  private write(items: readonly QueuedTripAction[]): Promise<void> {
    return this.storage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
