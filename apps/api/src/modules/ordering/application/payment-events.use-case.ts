import { PAYMENTS_EVENTS } from '@delyva/contracts';
import type { OrderLifecycle } from './order-lifecycle.js';
import type { OrderingLogger, OrderStore, PaymentsPort } from './ports.js';

/** Outcome of handling one payments event. `retry` leaves it unclaimed for the next poll. */
export type PaymentEventOutcome = 'applied' | 'ignored' | 'retry';

/** Collaborators. */
export interface PaymentEventDeps {
  readonly orders: OrderStore;
  readonly lifecycle: OrderLifecycle;
  readonly payments: Pick<PaymentsPort, 'releaseOrderHold'>;
  readonly logger: OrderingLogger;
}

/** Statuses an order can be in when it was closed before its payment was confirmed. */
const CLOSED_UNPAID = ['PAYMENT_FAILED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPS'];

/**
 * Applies verified payment outcomes to orders: `payments.intent.succeeded` moves
 * PENDING_PAYMENT → PLACED; `payments.intent.failed` → PAYMENT_FAILED. A late success for an
 * order already closed releases the new hold (funds stay in the customer's wallet).
 */
export class HandlePaymentEvent {
  /** @param deps collaborators */
  constructor(private readonly deps: PaymentEventDeps) {}

  /** Handles one event. */
  async execute(
    type: string,
    payload: { orderId?: string | null; intentId?: string },
  ): Promise<PaymentEventOutcome> {
    const orderId = payload.orderId;
    if (!orderId) return 'ignored';
    const order = await this.deps.orders.findById(orderId);
    if (!order) return 'retry';
    if (type === PAYMENTS_EVENTS.intentFailed) {
      await this.deps.lifecycle.run(orderId, (o) =>
        o.status === 'PENDING_PAYMENT'
          ? [{ to: 'PAYMENT_FAILED', actorType: 'system', actorId: null, reason: 'payment_failed' }]
          : [],
      );
      return 'applied';
    }
    const after = await this.deps.lifecycle.run(orderId, (o) =>
      o.status === 'PENDING_PAYMENT'
        ? [{ to: 'PLACED', actorType: 'system', actorId: null, reason: 'payment_succeeded' }]
        : [],
    );
    if (CLOSED_UNPAID.includes(after.status)) {
      await this.deps.payments.releaseOrderHold(orderId);
      this.deps.logger.info({ orderId }, 'late payment for a closed order; hold released');
    }
    return 'applied';
  }
}
