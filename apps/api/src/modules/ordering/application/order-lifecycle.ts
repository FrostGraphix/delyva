import {
  type OrderActorType,
  orderEventType,
  type OrderStatus,
  type OrderStatusChangedPayload,
  type OrderVendorAcceptedPayload,
} from '@delyva/contracts';
import { orderRef } from '../domain/order-money.js';
import {
  assertActor,
  assertTransition,
  REFUNDABLE_EXITS,
} from '../domain/order-state-machine.js';
import { OrderingError } from '../domain/ordering-errors.js';
import type {
  AutoRejectScheduler,
  Clock,
  OrderingConfig,
  OrderingEvent,
  OrderingLogger,
  OrderPatch,
  OrderRecord,
  OrderStore,
  OrderTx,
  PaymentsPort,
  TrackingPort,
} from './ports.js';

/** One requested transition. */
export interface TransitionStep {
  readonly to: OrderStatus;
  readonly actorType: OrderActorType;
  readonly actorId: string | null;
  readonly reason?: string | null;
  readonly patch?: OrderPatch;
}

/** Collaborators of {@link OrderLifecycle}. */
export interface LifecycleDeps {
  readonly store: OrderStore;
  readonly payments: Pick<PaymentsPort, 'releaseOrderHold'>;
  readonly tracking: TrackingPort;
  readonly scheduler: AutoRejectScheduler;
  readonly clock: Clock;
  readonly logger: OrderingLogger;
  readonly config: Pick<OrderingConfig, 'autoRejectMs'>;
}

/** Builds the outbox event for entering `order.status`. */
export function statusEvent(
  order: OrderRecord,
  previous: OrderStatus | null,
  step: TransitionStep,
  at: Date,
): OrderingEvent {
  const base: OrderStatusChangedPayload = {
    orderId: order.id,
    orderRef: orderRef(order.id),
    customerId: order.customerId,
    vendorId: order.vendorId,
    branchId: order.branchId,
    riderId: order.riderId,
    status: order.status,
    previousStatus: previous,
    actor: { type: step.actorType, id: step.actorId },
    reason: step.reason ?? null,
    at: at.toISOString(),
  };
  const payload: OrderStatusChangedPayload | OrderVendorAcceptedPayload =
    order.status === 'VENDOR_ACCEPTED' && order.prepMinutes !== null && order.readyAt !== null
      ? {
          ...base,
          pickup: order.pickup,
          dropoff: order.dropoff,
          prepMinutes: order.prepMinutes,
          readyAt: order.readyAt.toISOString(),
        }
      : base;
  return { type: orderEventType(order.status), aggregateId: order.id, payload };
}

/**
 * Applies one transition inside an open transaction: validates it against the transition table
 * and the actor rules, updates the row, appends history (actor, time, reason) and the
 * `ordering.order.<state>` outbox event — all in the caller's transaction.
 */
export async function applyStep(
  tx: OrderTx,
  order: OrderRecord,
  step: TransitionStep,
  at: Date,
): Promise<OrderRecord> {
  assertTransition(order.status, step.to);
  assertActor(step.to, step.actorType);
  const patch: OrderPatch = { ...step.patch, status: step.to };
  await tx.updateOrder(order.id, patch, at);
  const next: OrderRecord = { ...order, ...patch, updatedAt: at };
  await tx.appendHistory(order.id, {
    status: step.to,
    at,
    actorType: step.actorType,
    actorId: step.actorId,
    reason: step.reason ?? null,
  });
  await tx.appendEvent(statusEvent(next, order.status, step, at));
  return next;
}

/** Adds REFUND_PENDING after a refundable exit when money was reserved (order got past payment). */
export function withRefund(order: OrderRecord, steps: TransitionStep[]): TransitionStep[] {
  const exit = steps.at(-1);
  if (!exit || !REFUNDABLE_EXITS.includes(exit.to) || order.status === 'PENDING_PAYMENT') {
    return steps;
  }
  return [...steps, { to: 'REFUND_PENDING', actorType: 'system', actorId: null, reason: exit.reason ?? null }];
}

/**
 * Runs order transitions: lock → plan → apply → commit, then after-commit effects (realtime
 * push, auto-reject scheduling, rider trip binding, hold release for refunds).
 */
export class OrderLifecycle {
  /** @param deps collaborators */
  constructor(private readonly deps: LifecycleDeps) {}

  /**
   * Locks the order, asks `plan` for steps (an empty plan is an idempotent no-op) and applies
   * them atomically. @throws OrderingError not_found | conflict | forbidden
   */
  async run(
    orderId: string,
    plan: (order: OrderRecord) => TransitionStep[] | Promise<TransitionStep[]>,
  ): Promise<OrderRecord> {
    const at = this.deps.clock.now();
    const result = await this.deps.store.transaction(async (tx) => {
      const locked = await tx.lockOrder(orderId);
      if (!locked) throw new OrderingError('not_found', 'Order not found.');
      const steps = await plan(locked);
      let order = locked;
      for (const step of steps) order = await applyStep(tx, order, step, at);
      return { before: locked, order, steps };
    });
    if (result.steps.length === 0) return result.order;
    return this.afterCommit(result.before, result.order, result.steps, at);
  }

  /** After-commit effects; never throws for side-effect failures (logged, retried elsewhere). */
  async afterCommit(
    before: OrderRecord,
    order: OrderRecord,
    steps: readonly TransitionStep[],
    at: Date,
  ): Promise<OrderRecord> {
    for (const s of steps) this.publish(order.id, s.to, at);
    const entered = new Set(steps.map((s) => s.to));
    await this.safely(order.id, 'auto-reject scheduling', async () => {
      if (entered.has('PLACED')) await this.deps.scheduler.schedule(order.id, this.deps.config.autoRejectMs);
      else if (before.status === 'PLACED') await this.deps.scheduler.cancel(order.id);
    });
    await this.safely(order.id, 'trip binding', () => this.bindTrip(order, entered));
    if (order.status === 'REFUND_PENDING') return this.completeRefund(order.id);
    return order;
  }

  private async bindTrip(order: OrderRecord, entered: Set<OrderStatus>): Promise<void> {
    if (!order.riderId) return;
    if (entered.has('RIDER_ASSIGNED')) await this.deps.tracking.startTrip(order.riderId, order.id);
    const ends: OrderStatus[] = ['DELIVERED', 'UNDELIVERABLE', 'CANCELLED_BY_OPS'];
    if (ends.some((s) => entered.has(s))) await this.deps.tracking.endTrip(order.riderId);
  }

  /** Releases the uncaptured hold (funds return to the customer's wallet) → REFUNDED. */
  async completeRefund(orderId: string): Promise<OrderRecord> {
    try {
      await this.deps.payments.releaseOrderHold(orderId);
    } catch (err) {
      // DEBT(ordering): a failed release leaves the order REFUND_PENDING — no retry job yet — add a BullMQ retry + ops alert.
      this.deps.logger.error({ err, orderId }, 'hold release failed; order left REFUND_PENDING');
      const current = await this.deps.store.findById(orderId);
      if (!current) throw new OrderingError('not_found', 'Order not found.');
      return current;
    }
    return this.run(orderId, (o) =>
      o.status === 'REFUND_PENDING'
        ? [{ to: 'REFUNDED', actorType: 'system', actorId: null, reason: 'hold_released' }]
        : [],
    );
  }

  private publish(orderId: string, status: OrderStatus, at: Date): void {
    try {
      this.deps.tracking.publishOrderStatus(orderId, status, at);
    } catch (err) {
      this.deps.logger.warn({ err, orderId }, 'realtime status push failed');
    }
  }

  private async safely(orderId: string, what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.deps.logger.warn({ err, orderId }, `${what} failed`);
    }
  }
}
