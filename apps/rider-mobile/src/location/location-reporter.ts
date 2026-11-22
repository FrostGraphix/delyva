import {
  LOCATION_BATCH_MAX,
  LOCATION_MAX_AGE_MS,
  type LocationBatchResult,
  type RiderLocationInput,
  type SocketAck,
} from '@delyva/contracts';

/** Transport ports for {@link LocationReporter}. */
export interface LocationTransport {
  readonly socketConnected: () => boolean;
  readonly sendSocket: (fix: RiderLocationInput) => Promise<SocketAck>;
  readonly sendBatch: (points: RiderLocationInput[]) => Promise<LocationBatchResult>;
  readonly now?: () => number;
}

/**
 * Sends rider fixes over the socket (`rider:location`) and falls back to the batched HTTP
 * endpoint when the socket is down or an ack times out. Undelivered fixes are buffered (newest
 * {@link LOCATION_BATCH_MAX}, younger than {@link LOCATION_MAX_AGE_MS}) and flushed in order.
 */
export class LocationReporter {
  private buffer: RiderLocationInput[] = [];

  /** @param transport socket and HTTP senders */
  constructor(private readonly transport: LocationTransport) {}

  /** Number of fixes waiting for the HTTP fallback. */
  get buffered(): number {
    return this.buffer.length;
  }

  /** Reports one fix; resolves with the channel that delivered it (or `buffered`). */
  async report(fix: RiderLocationInput): Promise<'socket' | 'http' | 'buffered'> {
    if (this.transport.socketConnected() && this.buffer.length === 0) {
      const ack = await this.transport
        .sendSocket(fix)
        .catch((): SocketAck => ({ ok: false, code: 'internal_error' }));
      if (ack.ok) return 'socket';
      if (ack.code === 'validation_failed') return 'buffered'; // never resend a fix the server refused
    }
    this.push(fix);
    return (await this.flush()) ? 'http' : 'buffered';
  }

  /** Sends buffered fixes over HTTP; true when the buffer was emptied. */
  async flush(): Promise<boolean> {
    this.prune();
    if (this.buffer.length === 0) return true;
    const batch = [...this.buffer];
    try {
      await this.transport.sendBatch(batch);
      this.buffer = this.buffer.slice(batch.length);
      return this.buffer.length === 0;
    } catch {
      return false;
    }
  }

  private push(fix: RiderLocationInput): void {
    this.buffer = [...this.buffer, fix].slice(-LOCATION_BATCH_MAX);
  }

  private prune(): void {
    const now = (this.transport.now ?? Date.now)();
    this.buffer = this.buffer.filter((p) => now - p.ts < LOCATION_MAX_AGE_MS);
  }
}
