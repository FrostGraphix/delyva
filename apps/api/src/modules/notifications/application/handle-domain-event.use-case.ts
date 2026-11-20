import { UserRegisteredPayloadSchema } from '@delyva/contracts';
import { z } from 'zod';
import {
  type NotifyCommand,
  ORDER_EVENT_TEMPLATES,
  orderCommand,
  welcomeCommand,
} from '../domain/event-mappings.js';
import type { NotifyResult, NotifyUser } from './notify-user.use-case.js';

/**
 * Expected payload of `ordering.order.*` events.
 * DEBT(notifications): placeholder until ordering publishes its event schemas in contracts — replace with the contracts schema.
 */
const OrderEventPayloadSchema = z.object({
  orderId: z.uuid(),
  customerId: z.uuid(),
  orderRef: z.string().min(1).max(20).optional(),
});

/** Minimal event view consumed here. */
export interface ConsumedEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
}

/** Outcome of handling one event. */
export type HandleEventResult =
  | { readonly status: 'notified'; readonly result: NotifyResult }
  | { readonly status: 'ignored'; readonly reason: 'unmapped_type' | 'invalid_payload' };

/** Maps a domain event to a notify command and executes it. */
export class HandleDomainEvent {
  /** @param notify notify-user use case */
  constructor(private readonly notify: NotifyUser) {}

  /** Executes for one event. Invalid payloads are ignored (logged by the caller), never retried. */
  async execute(event: ConsumedEvent): Promise<HandleEventResult> {
    const cmd = toCommand(event);
    if (cmd === 'unmapped_type' || cmd === 'invalid_payload') {
      return { status: 'ignored', reason: cmd };
    }
    return { status: 'notified', result: await this.notify.execute(cmd) };
  }
}

function toCommand(event: ConsumedEvent): NotifyCommand | 'unmapped_type' | 'invalid_payload' {
  if (event.type === 'identity.user.registered') {
    const parsed = UserRegisteredPayloadSchema.safeParse(event.payload);
    return parsed.success ? welcomeCommand(event.id, parsed.data.userId) : 'invalid_payload';
  }
  if (ORDER_EVENT_TEMPLATES[event.type]) {
    const parsed = OrderEventPayloadSchema.safeParse(event.payload);
    if (!parsed.success) return 'invalid_payload';
    return orderCommand(event.id, event.type, parsed.data) ?? 'unmapped_type';
  }
  return 'unmapped_type';
}
