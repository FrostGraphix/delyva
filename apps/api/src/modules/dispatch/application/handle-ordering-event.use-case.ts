import {
  ORDER_VENDOR_ACCEPTED_EVENT as VENDOR_ACCEPTED_EVENT,
  OrderVendorAcceptedPayloadSchema,
} from '@delyva/contracts';

/** The fields dispatch reads (extra fields such as customerId are tolerated). */
const VendorAcceptedPayloadSchema = OrderVendorAcceptedPayloadSchema.pick({
  orderId: true,
  branchId: true,
  pickup: true,
  dropoff: true,
  prepMinutes: true,
  readyAt: true,
});
import type { ScheduleDispatch } from './schedule-dispatch.use-case.js';

/** Event types the dispatch consumer reads from the outbox. */
export const DISPATCH_CONSUMED_EVENT_TYPES: readonly string[] = [VENDOR_ACCEPTED_EVENT];

/** Outcome of handling one consumed event. */
export type DispatchEventOutcome =
  | { readonly status: 'scheduled'; readonly delayMs: number; readonly duplicate: boolean }
  | { readonly status: 'ignored'; readonly reason: string };

/** Routes consumed outbox events to dispatch commands (invalid payloads are ignored, not retried). */
export class HandleOrderingEvent {
  /** @param schedule schedule command */
  constructor(private readonly schedule: ScheduleDispatch) {}

  /** Handles one event row. */
  async execute(event: { type: string; payload: unknown }): Promise<DispatchEventOutcome> {
    if (event.type !== VENDOR_ACCEPTED_EVENT) return { status: 'ignored', reason: 'unknown_type' };
    const parsed = VendorAcceptedPayloadSchema.safeParse(event.payload);
    if (!parsed.success) return { status: 'ignored', reason: 'invalid_payload' };
    const out = await this.schedule.execute(parsed.data);
    return { status: 'scheduled', delayMs: out.delayMs, duplicate: out.duplicate };
  }
}
