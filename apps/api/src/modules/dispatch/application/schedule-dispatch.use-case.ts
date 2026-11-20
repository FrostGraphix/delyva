import { dispatchDelayMs } from '../domain/dispatch-strategy.js';
import type { OrderVendorAcceptedPayload } from '@delyva/contracts';

/** The part of `ordering.order.vendor_accepted` dispatch needs. */
type VendorAcceptedPayload = Pick<
  OrderVendorAcceptedPayload,
  'orderId' | 'branchId' | 'pickup' | 'dropoff' | 'prepMinutes' | 'readyAt'
>;
import type { Clock, DispatchConfig, DispatchScheduler, DispatchStore, Tracking } from './ports.js';

/** Outcome of handling `ordering.order.vendor_accepted`. */
export interface ScheduleOutcome {
  readonly duplicate: boolean;
  readonly delayMs: number;
}

/**
 * Command: on vendor accept, record the dispatch request and schedule the first offer round at
 * `readyAt − estimated rider travel`. Travel uses the nearest rider within the widest radius,
 * or the configured default when nobody is around. Idempotent per order.
 */
export class ScheduleDispatch {
  /** Injected ports. */
  constructor(
    private readonly deps: {
      store: DispatchStore;
      tracking: Tracking;
      scheduler: DispatchScheduler;
      clock: Clock;
      config: Pick<DispatchConfig, 'radiiM' | 'riderSpeedMps' | 'defaultTravelSeconds'>;
    },
  ) {}

  /** Executes the command. */
  async execute(event: VendorAcceptedPayload): Promise<ScheduleOutcome> {
    const { store, scheduler, clock } = this.deps;
    const inserted = await store.insertRequest({
      orderId: event.orderId,
      branchId: event.branchId,
      pickup: event.pickup,
      dropoff: event.dropoff,
      prepMinutes: event.prepMinutes,
      readyAt: new Date(event.readyAt),
      status: 'scheduled',
      radiusStep: 0,
      declines: 0,
      attempts: 0,
    });
    const travel = await this.travelSeconds(event.pickup);
    const delayMs = dispatchDelayMs(new Date(event.readyAt), clock.now(), travel);
    // Re-scheduling a duplicate is a no-op (deterministic job id), and recovers a crash
    // between the insert and the enqueue.
    await scheduler.scheduleStart(event.orderId, delayMs);
    return { duplicate: !inserted, delayMs };
  }

  private async travelSeconds(pickup: { lat: number; lng: number }): Promise<number> {
    const { tracking, config } = this.deps;
    const widest = config.radiiM.at(-1) ?? 0;
    const [nearest] = await tracking.ridersNear(pickup.lat, pickup.lng, widest, 1);
    return nearest
      ? Math.ceil(nearest.distanceM / config.riderSpeedMps)
      : config.defaultTravelSeconds;
  }
}
