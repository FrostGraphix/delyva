import type { OrderFulfilmentPort, OrderFulfilmentResult, OrderStatus } from '@delyva/contracts';
import { splitOrder } from '../domain/order-money.js';
import { OrderingError } from '../domain/ordering-errors.js';
import { type OrderLifecycle, type TransitionStep, withRefund } from './order-lifecycle.js';
import type { OrderCodes, OrderingConfig, OrderRecord, OrderStore, PaymentsPort } from './ports.js';

/** Collaborators. */
export interface FulfilmentDeps {
  readonly orders: OrderStore;
  readonly lifecycle: OrderLifecycle;
  readonly payments: Pick<PaymentsPort, 'captureOrderSplit'>;
  readonly codes: OrderCodes;
  readonly config: Pick<OrderingConfig, 'terms'>;
}

const ASSIGNABLE: readonly OrderStatus[] = ['VENDOR_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'];

/**
 * Ordering's implementation of {@link OrderFulfilmentPort} (called by dispatch). Only the
 * assigned rider may move an order; replays of an already-applied step return the current status.
 */
export class OrderFulfilmentService implements OrderFulfilmentPort {
  /** @param deps collaborators */
  constructor(private readonly deps: FulfilmentDeps) {}

  /** @inheritdoc */
  async markRiderAssigned(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    const o = await this.deps.lifecycle.run(orderId, (order) => {
      if (order.riderId === riderId) return [];
      if (order.riderId !== null) throw new OrderingError('conflict', 'Order already has a rider.');
      if (!ASSIGNABLE.includes(order.status)) {
        throw new OrderingError('conflict', `Cannot assign a rider in ${order.status}.`);
      }
      if (order.status === 'READY_FOR_PICKUP') {
        return [{ to: 'RIDER_ASSIGNED', actorType: 'rider', actorId: riderId, patch: { riderId } }];
      }
      return [];
    });
    if (o.riderId === null && o.status !== 'RIDER_ASSIGNED') {
      // Assignment during prep: bind the rider without a status change (the table is strict).
      return this.bindEarly(orderId, riderId);
    }
    return result(o);
  }

  private async bindEarly(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    const o = await this.deps.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new OrderingError('not_found', 'Order not found.');
      if (order.riderId !== null && order.riderId !== riderId) {
        throw new OrderingError('conflict', 'Order already has a rider.');
      }
      if (!ASSIGNABLE.includes(order.status)) {
        throw new OrderingError('conflict', `Cannot assign a rider in ${order.status}.`);
      }
      await tx.updateOrder(orderId, { riderId }, new Date());
      return { ...order, riderId };
    });
    return result(o);
  }

  /** @inheritdoc */
  markRiderAtVendor(orderId: string, riderId: string, pickupCode: string): Promise<OrderFulfilmentResult> {
    return this.step(orderId, riderId, 'RIDER_AT_VENDOR', (o) => {
      if (!this.deps.codes.verify(o.id, 'pickup', pickupCode, o.pickupCodeHash)) {
        throw new OrderingError('validation_failed', 'Pickup code is incorrect.');
      }
    });
  }

  /** @inheritdoc */
  markPickedUp(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    return this.step(orderId, riderId, 'PICKED_UP');
  }

  /** @inheritdoc */
  markRiderAtCustomer(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    return this.step(orderId, riderId, 'RIDER_AT_CUSTOMER');
  }

  /** @inheritdoc Captures the payment split before the DELIVERED transition (idempotent). */
  async markDelivered(orderId: string, riderId: string, deliveryOtp: string): Promise<OrderFulfilmentResult> {
    const order = await this.owned(orderId, riderId);
    if (order.status === 'DELIVERED') return result(order);
    if (order.status !== 'RIDER_AT_CUSTOMER') {
      throw new OrderingError('conflict', `Order cannot move from ${order.status} to DELIVERED.`);
    }
    if (!this.deps.codes.verify(order.id, 'delivery', deliveryOtp, order.deliveryOtpHash)) {
      throw new OrderingError('validation_failed', 'Delivery code is incorrect.');
    }
    const split = splitOrder(order.totals, this.deps.config.terms);
    await this.deps.payments.captureOrderSplit(orderId, {
      customerUserId: order.customerId,
      vendorId: order.vendorId,
      riderId,
      ...split,
    });
    return this.step(orderId, riderId, 'DELIVERED');
  }

  /** @inheritdoc */
  async markUndeliverable(orderId: string, riderId: string, reason: string): Promise<OrderFulfilmentResult> {
    await this.owned(orderId, riderId);
    const o = await this.deps.lifecycle.run(orderId, (order) => {
      assertRider(order, riderId);
      if (['UNDELIVERABLE', 'REFUND_PENDING', 'REFUNDED'].includes(order.status)) return [];
      return withRefund(order, [{ to: 'UNDELIVERABLE', actorType: 'rider', actorId: riderId, reason }]);
    });
    return result(o);
  }

  private async owned(orderId: string, riderId: string): Promise<OrderRecord> {
    const order = await this.deps.orders.findById(orderId);
    if (!order) throw new OrderingError('not_found', 'Order not found.');
    assertRider(order, riderId);
    return order;
  }

  private async step(
    orderId: string,
    riderId: string,
    to: OrderStatus,
    check?: (o: OrderRecord) => void,
  ): Promise<OrderFulfilmentResult> {
    const o = await this.deps.lifecycle.run(orderId, (order): TransitionStep[] => {
      assertRider(order, riderId);
      if (order.status === to) return [];
      check?.(order);
      return [{ to, actorType: 'rider', actorId: riderId }];
    });
    return result(o);
  }
}

function assertRider(order: OrderRecord, riderId: string): void {
  if (order.riderId !== riderId) {
    throw new OrderingError('forbidden', 'Only the assigned rider may update this order.');
  }
}

function result(o: OrderRecord): OrderFulfilmentResult {
  return { orderId: o.id, status: o.status };
}
