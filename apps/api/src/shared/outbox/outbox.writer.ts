import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@delyva/contracts';
import type { Db } from '../database/database.js';
import { currentTraceId } from '../tracing/request-context.js';
import { outboxEvents } from './outbox.schema.js';

/** Transaction handle accepted by the writer (a Drizzle db or tx). */
export type OutboxTx = Pick<Db, 'insert'>;

/** Event to append; id/occurredAt/traceId are filled in. */
export interface NewOutboxEvent<P> {
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: P;
  readonly version?: number;
}

/** Appends a domain event to the outbox inside the caller's transaction. */
export async function appendToOutbox<P>(
  tx: OutboxTx,
  event: NewOutboxEvent<P>,
): Promise<EventEnvelope<P>> {
  const envelope: EventEnvelope<P> = {
    id: randomUUID(),
    type: event.type,
    version: event.version ?? 1,
    occurredAt: new Date().toISOString(),
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    traceId: currentTraceId(),
    payload: event.payload,
  };
  await tx.insert(outboxEvents).values({
    id: envelope.id,
    type: envelope.type,
    version: envelope.version,
    aggregateType: envelope.aggregateType,
    aggregateId: envelope.aggregateId,
    payload: envelope.payload,
    traceId: envelope.traceId ?? null,
    occurredAt: new Date(envelope.occurredAt),
  });
  return envelope;
}
