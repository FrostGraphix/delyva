import type { OrderActorType, OrderStatus } from '@delyva/contracts';
import { OrderingError } from './ordering-errors.js';

/**
 * The order state machine (ARCHITECTURE "Order state machine"), as an explicit transition table.
 * Any pair not listed here is rejected.
 *
 * Happy path: PENDING_PAYMENT → PLACED → VENDOR_ACCEPTED → PREPARING → READY_FOR_PICKUP →
 * RIDER_ASSIGNED → RIDER_AT_VENDOR → PICKED_UP → RIDER_AT_CUSTOMER → DELIVERED.
 * Side exits: PAYMENT_FAILED; VENDOR_REJECTED; CANCELLED_BY_CUSTOMER (only before PREPARING);
 * CANCELLED_BY_OPS (any active state); UNDELIVERABLE (after pickup). Rejected, cancelled and
 * undeliverable orders continue to REFUND_PENDING → REFUNDED when money was reserved.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: ['PLACED', 'PAYMENT_FAILED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPS'],
  PLACED: ['VENDOR_ACCEPTED', 'VENDOR_REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPS'],
  VENDOR_ACCEPTED: ['PREPARING', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPS'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED_BY_OPS'],
  READY_FOR_PICKUP: ['RIDER_ASSIGNED', 'CANCELLED_BY_OPS'],
  RIDER_ASSIGNED: ['RIDER_AT_VENDOR', 'CANCELLED_BY_OPS'],
  RIDER_AT_VENDOR: ['PICKED_UP', 'CANCELLED_BY_OPS'],
  PICKED_UP: ['RIDER_AT_CUSTOMER', 'UNDELIVERABLE', 'CANCELLED_BY_OPS'],
  RIDER_AT_CUSTOMER: ['DELIVERED', 'UNDELIVERABLE', 'CANCELLED_BY_OPS'],
  DELIVERED: [],
  PAYMENT_FAILED: [],
  VENDOR_REJECTED: ['REFUND_PENDING'],
  CANCELLED_BY_CUSTOMER: ['REFUND_PENDING'],
  CANCELLED_BY_OPS: ['REFUND_PENDING'],
  UNDELIVERABLE: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  REFUNDED: [],
};

/** Whether `from → to` is in the table. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Returns `to` when allowed. @throws OrderingError conflict */
export function assertTransition(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransition(from, to)) {
    throw new OrderingError('conflict', `Order cannot move from ${from} to ${to}.`);
  }
  return to;
}

/** States whose exit leads to a refund/release of reserved money. */
export const REFUNDABLE_EXITS: readonly OrderStatus[] = [
  'VENDOR_REJECTED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OPS',
  'UNDELIVERABLE',
];

/** True while the order is in progress (not finished, failed or being unwound). */
export function isActive(status: OrderStatus): boolean {
  return canTransition(status, 'CANCELLED_BY_OPS');
}

/** Which actor types may drive a transition into `to`. Defence in depth for use cases. */
export const ACTORS_FOR: Readonly<Record<OrderStatus, readonly OrderActorType[]>> = {
  PENDING_PAYMENT: ['customer'],
  PLACED: ['customer', 'system'],
  VENDOR_ACCEPTED: ['vendor'],
  PREPARING: ['vendor'],
  READY_FOR_PICKUP: ['vendor'],
  RIDER_ASSIGNED: ['rider', 'system'],
  RIDER_AT_VENDOR: ['rider'],
  PICKED_UP: ['rider'],
  RIDER_AT_CUSTOMER: ['rider'],
  DELIVERED: ['rider'],
  PAYMENT_FAILED: ['system', 'customer'],
  VENDOR_REJECTED: ['vendor', 'system'],
  CANCELLED_BY_CUSTOMER: ['customer'],
  CANCELLED_BY_OPS: ['ops'],
  UNDELIVERABLE: ['rider'],
  REFUND_PENDING: ['system', 'customer', 'vendor', 'ops', 'rider'],
  REFUNDED: ['system', 'customer', 'vendor', 'ops', 'rider'],
};

/** @throws OrderingError forbidden when the actor type may not cause `to` */
export function assertActor(to: OrderStatus, actor: OrderActorType): void {
  if (!ACTORS_FOR[to].includes(actor)) {
    throw new OrderingError('forbidden', `A ${actor} cannot move an order to ${to}.`);
  }
}
