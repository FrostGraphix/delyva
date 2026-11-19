import { z } from 'zod';

/** Event type naming rule: `context.entity.past_tense`, e.g. `ordering.order.placed`. */
export const EventTypeSchema = z
  .string()
  .regex(/^[a-z]+\.[a-z_]+\.[a-z_]+$/, 'Event type must be context.entity.past_tense');

/** Builds the envelope schema for a given payload schema. */
export function eventEnvelopeSchema<T extends z.ZodType>(payload: T) {
  return z.object({
    id: z.uuid(),
    type: EventTypeSchema,
    version: z.number().int().positive(),
    occurredAt: z.iso.datetime(),
    aggregateType: z.string().min(1),
    aggregateId: z.string().min(1),
    traceId: z.string().optional(),
    payload,
  });
}

/** Envelope with an unknown payload, used by transports. */
export const EventEnvelopeSchema = eventEnvelopeSchema(z.unknown());
/** Domain event envelope written to the outbox and published to the bus. */
export type EventEnvelope<P = unknown> = Omit<z.infer<typeof EventEnvelopeSchema>, 'payload'> & {
  payload: P;
};

/** Payload of `identity.user.registered`. */
export const UserRegisteredPayloadSchema = z.object({ userId: z.uuid() });
/** Payload of `identity.user.registered`. */
export type UserRegisteredPayload = z.infer<typeof UserRegisteredPayloadSchema>;
