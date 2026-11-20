import type { PaymentIntent, PaymentMethod } from '@delyva/contracts';
import type { Money } from '@delyva/utils';
import type { OrderBreakdown } from '../domain/order-split.js';
import type { CaptureOrderSplit, RefundOrder, ReleaseOrderHold } from './order-money.use-cases.js';
import type { CreateIntentForOrder } from './payment-intents.use-cases.js';

/**
 * Public service interface of the payments context for other contexts (ordering).
 * Other modules depend on this facade only, never on payments tables.
 */
export class PaymentsService {
  /** @param deps use cases */
  constructor(
    private readonly deps: {
      createIntent: CreateIntentForOrder;
      capture: CaptureOrderSplit;
      release: ReleaseOrderHold;
      refund: RefundOrder;
    },
  ) {}

  /** Creates (or returns) the payment intent of an order. Amounts must be server-computed. */
  createIntentForOrder(input: {
    orderId: string;
    userId: string;
    amount: Money;
    method: PaymentMethod;
  }): Promise<PaymentIntent> {
    return this.deps.createIntent.execute(input);
  }

  /** Captures the order hold and posts the split. Idempotent per order. */
  captureOrderSplit(
    orderId: string,
    breakdown: OrderBreakdown,
  ): Promise<{ transactionId: string }> {
    return this.deps.capture.execute(orderId, breakdown);
  }

  /** Releases an uncaptured order hold. Idempotent. */
  releaseOrderHold(orderId: string): Promise<{ released: boolean }> {
    return this.deps.release.execute(orderId);
  }

  /** Full (no amount) or partial refund via compensating ledger entries. */
  refundOrder(input: {
    orderId: string;
    amount?: Money;
    destination: 'wallet' | 'source';
    reason: string;
  }): Promise<{ refundId: string; amount: Money }> {
    return this.deps.refund.execute(input);
  }
}
