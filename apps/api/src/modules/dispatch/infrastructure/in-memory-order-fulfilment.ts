/** In-memory test double for ordering's OrderFulfilmentPort (dispatch unit/integration tests). */
import type { OrderFulfilmentPort, OrderFulfilmentResult } from '@delyva/contracts';
import { DispatchError } from '../domain/dispatch-errors.js';

type Stage =
  | 'RIDER_ASSIGNED'
  | 'RIDER_AT_VENDOR'
  | 'PICKED_UP'
  | 'RIDER_AT_CUSTOMER'
  | 'DELIVERED'
  | 'UNDELIVERABLE';

const FROM: Record<Stage, readonly (Stage | 'READY')[]> = {
  RIDER_ASSIGNED: ['READY'],
  RIDER_AT_VENDOR: ['RIDER_ASSIGNED'],
  PICKED_UP: ['RIDER_AT_VENDOR'],
  RIDER_AT_CUSTOMER: ['PICKED_UP'],
  DELIVERED: ['RIDER_AT_CUSTOMER'],
  UNDELIVERABLE: ['PICKED_UP', 'RIDER_AT_CUSTOMER'],
};

/** One recorded port call. */
export interface FulfilmentCall {
  readonly method: keyof OrderFulfilmentPort;
  readonly orderId: string;
  readonly riderId: string;
  readonly arg?: string;
}

/**
 * Mimics ordering's state machine for the rider-facing transitions: rejects out-of-order moves
 * and wrong rider, and checks pickup code / delivery OTP when they were registered with
 * {@link setCodes} (orders without registered codes accept any well-formed code).
 */
export class InMemoryOrderFulfilment implements OrderFulfilmentPort {
  /** Every successful call, in order. */
  readonly calls: FulfilmentCall[] = [];
  private readonly stage = new Map<string, Stage>();
  private readonly rider = new Map<string, string>();
  private readonly codes = new Map<string, { pickupCode: string; deliveryOtp: string }>();

  /** Registers the codes ordering would have generated for an order. */
  setCodes(orderId: string, codes: { pickupCode: string; deliveryOtp: string }): void {
    this.codes.set(orderId, codes);
  }

  /** Current simulated order stage. */
  stageOf(orderId: string): string {
    return this.stage.get(orderId) ?? 'READY';
  }

  private move(
    orderId: string,
    riderId: string,
    to: Stage,
    method: keyof OrderFulfilmentPort,
    arg?: string,
  ): Promise<OrderFulfilmentResult> {
    const current = this.stage.get(orderId) ?? 'READY';
    if (!FROM[to].includes(current)) {
      return Promise.reject(
        new DispatchError('conflict', `Order cannot move from ${current} to ${to}.`),
      );
    }
    const assigned = this.rider.get(orderId);
    if (to !== 'RIDER_ASSIGNED' && assigned !== riderId) {
      return Promise.reject(new DispatchError('forbidden', 'Rider is not assigned to this order.'));
    }
    if (to === 'RIDER_ASSIGNED') this.rider.set(orderId, riderId);
    this.stage.set(orderId, to);
    this.calls.push({ method, orderId, riderId, ...(arg === undefined ? {} : { arg }) });
    return Promise.resolve({ orderId, status: to });
  }

  private checkCode(
    orderId: string,
    kind: 'pickupCode' | 'deliveryOtp',
    value: string,
  ): Promise<void> {
    const expected = this.codes.get(orderId)?.[kind];
    if (expected !== undefined && expected !== value) {
      return Promise.reject(
        new DispatchError(
          'validation_failed',
          `The ${kind === 'pickupCode' ? 'pickup code' : 'delivery OTP'} is incorrect.`,
        ),
      );
    }
    return Promise.resolve();
  }

  /** @inheritdoc */
  markRiderAssigned(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    return this.move(orderId, riderId, 'RIDER_ASSIGNED', 'markRiderAssigned');
  }

  /** @inheritdoc */
  async markRiderAtVendor(orderId: string, riderId: string, pickupCode: string): Promise<OrderFulfilmentResult> {
    await this.checkCode(orderId, 'pickupCode', pickupCode);
    return this.move(orderId, riderId, 'RIDER_AT_VENDOR', 'markRiderAtVendor');
  }

  /** @inheritdoc */
  markPickedUp(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    return this.move(orderId, riderId, 'PICKED_UP', 'markPickedUp');
  }

  /** @inheritdoc */
  markRiderAtCustomer(orderId: string, riderId: string): Promise<OrderFulfilmentResult> {
    return this.move(orderId, riderId, 'RIDER_AT_CUSTOMER', 'markRiderAtCustomer');
  }

  /** @inheritdoc */
  async markDelivered(orderId: string, riderId: string, deliveryOtp: string): Promise<OrderFulfilmentResult> {
    await this.checkCode(orderId, 'deliveryOtp', deliveryOtp);
    return this.move(orderId, riderId, 'DELIVERED', 'markDelivered');
  }

  /** @inheritdoc */
  markUndeliverable(orderId: string, riderId: string, reason: string): Promise<OrderFulfilmentResult> {
    return this.move(orderId, riderId, 'UNDELIVERABLE', 'markUndeliverable', reason);
  }
}
