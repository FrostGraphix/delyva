import { PAYMENTS_EVENTS } from '@delyva/contracts';
import { Money } from '@delyva/utils';
import {
  accounts,
  buildJournal,
  credit,
  debit,
  parseAccountCode,
  PROMO_EXPENSE,
} from '../domain/ledger.js';
import {
  buildCaptureJournal,
  buildRefundJournal,
  type OrderBreakdown,
} from '../domain/order-split.js';
import { transition } from '../domain/payment-intent.js';
import { PaymentsError } from '../domain/payments-errors.js';
import { assertCanHold } from '../domain/wallet.js';
import type {
  Clock,
  PaymentProvider,
  PaymentsLogger,
  PaymentsStore,
  PaymentsTx,
  PostedLine,
} from './ports.js';

/**
 * Command: capture an order's held funds and post the split (vendor, rider, platform, tax, promo).
 * Idempotent per order: a second call returns the original ledger transaction.
 */
export class CaptureOrderSplit {
  /** @param store payments store @param clock clock */
  constructor(
    private readonly store: PaymentsStore,
    private readonly clock: Clock,
  ) {}

  /** Executes the command. @throws PaymentsError not_found | conflict | validation_failed */
  execute(orderId: string, breakdown: OrderBreakdown): Promise<{ transactionId: string }> {
    const journal = buildCaptureJournal(orderId, breakdown);
    return this.store.transaction(async (tx) => {
      await tx.lockWallet(breakdown.customerUserId);
      const hold = await tx.lockHold(orderId);
      if (hold?.userId !== breakdown.customerUserId) {
        throw new PaymentsError('not_found', 'No hold for this order.');
      }
      if (hold.status === 'captured') {
        const posted = await tx.post(journal);
        return { transactionId: posted.transactionId };
      }
      if (hold.status !== 'active') throw new PaymentsError('conflict', 'Hold was released.');
      if (!hold.amount.equals(breakdown.customerPaid)) {
        throw new PaymentsError('conflict', 'Capture amount differs from the hold.');
      }
      if (hold.expiresAt <= this.clock.now()) {
        // Lapsed holds no longer reserve funds: re-check availability under the lock.
        const view = await tx.walletView(hold.userId, hold.amount.currency, this.clock.now());
        assertCanHold(view, hold.amount);
      }
      const posted = await tx.post(journal);
      await tx.setHoldStatus(hold.id, 'captured');
      return { transactionId: posted.transactionId };
    });
  }
}

/** Command: release an order's hold (order cancelled before capture). Idempotent. */
export class ReleaseOrderHold {
  /** @param store payments store */
  constructor(private readonly store: PaymentsStore) {}

  /** Executes the command. */
  execute(orderId: string): Promise<{ released: boolean }> {
    return this.store.transaction(async (tx) => {
      const hold = await tx.lockHold(orderId);
      if (hold?.status !== 'active') return { released: false };
      await tx.setHoldStatus(hold.id, 'released');
      return { released: true };
    });
  }
}

/** Ledger position of a captured order rebuilt from its posted lines. */
interface OrderPosition {
  readonly customerUserId: string;
  readonly refundable: Money;
  readonly promo: Money;
  readonly legs: { account: string; amount: Money }[];
}

function orderPosition(lines: readonly PostedLine[]): OrderPosition | null {
  const relevant = lines.filter((l) => l.kind === 'order_capture' || l.kind === 'order_refund');
  const capture = relevant.find((l) => l.kind === 'order_capture');
  if (!capture) return null;
  const sums = new Map<string, Money>();
  for (const l of relevant) {
    sums.set(l.account, (sums.get(l.account) ?? Money.zero(l.amount.currency)).add(l.amount));
  }
  let customerUserId = '';
  let refundable = Money.zero(capture.amount.currency);
  let promo = Money.zero(capture.amount.currency);
  const legs: { account: string; amount: Money }[] = [];
  for (const [account, sum] of sums) {
    const { type, ownerId } = parseAccountCode(account);
    if (type === 'customer_wallet') {
      customerUserId = ownerId ?? '';
      refundable = sum;
    } else if (account === PROMO_EXPENSE) promo = sum;
    else if (sum.minor < 0) legs.push({ account, amount: sum.multiply(-1) });
  }
  return { customerUserId, refundable, promo, legs };
}

/** Dependencies of {@link RefundOrder}. */
export interface RefundOrderDeps {
  readonly store: PaymentsStore;
  readonly provider: PaymentProvider;
  readonly clock: Clock;
  readonly logger: PaymentsLogger;
}

/**
 * Command: refund (all or part of) a captured order. The compensating journal debits the payees
 * pro rata and credits the customer wallet; with destination `source` the money then leaves the
 * wallet back through the provider. Nothing is ever updated or deleted in the ledger.
 */
export class RefundOrder {
  /** @param deps ports */
  constructor(private readonly deps: RefundOrderDeps) {}

  /** Executes the command. @throws PaymentsError not_found | conflict */
  async execute(input: {
    orderId: string;
    amount?: Money;
    destination: 'wallet' | 'source';
    reason: string;
  }): Promise<{ refundId: string; amount: Money }> {
    const refundId = this.deps.clock.uuid();
    const result = await this.deps.store.transaction((tx) => this.post(tx, refundId, input));
    if (result.providerReference) await this.refundAtProvider(refundId, input.orderId, result);
    return { refundId, amount: result.amount };
  }

  private async post(
    tx: PaymentsTx,
    refundId: string,
    input: { orderId: string; amount?: Money; destination: 'wallet' | 'source'; reason: string },
  ): Promise<{ amount: Money; providerReference: string | null }> {
    await tx.lockKey(`order-refund:${input.orderId}`);
    const position = orderPosition(await tx.orderLines(input.orderId));
    if (!position) throw new PaymentsError('not_found', 'Order has not been captured.');
    const amount = input.amount ?? position.refundable;
    await tx.lockWallet(position.customerUserId);
    await tx.post(buildRefundJournal({ ...input, refundId, amount, ...position }));
    const fullyRefunded = amount.equals(position.refundable);
    const providerReference =
      input.destination === 'source'
        ? await this.moveToSource(
            tx,
            refundId,
            input.orderId,
            amount,
            position.customerUserId,
            fullyRefunded,
          )
        : null;
    await tx.insertRefund({
      id: refundId,
      orderId: input.orderId,
      amount,
      destination: input.destination,
      status: providerReference ? 'pending_provider' : 'completed',
      reason: input.reason,
    });
    if (!providerReference) await this.emitCompleted(tx, refundId, input.orderId, amount, 'wallet');
    return { amount, providerReference };
  }

  private async moveToSource(
    tx: PaymentsTx,
    refundId: string,
    orderId: string,
    amount: Money,
    userId: string,
    fullyRefunded: boolean,
  ): Promise<string> {
    const intent = await tx.findOrderIntent(orderId);
    if (intent?.status !== 'succeeded' || intent.provider !== this.deps.provider.name) {
      throw new PaymentsError('conflict', 'Order was not paid through the provider.');
    }
    await tx.post(
      buildJournal({
        kind: 'refund_to_source',
        idempotencyKey: `refund:${refundId}:source`,
        reference: orderId,
        lines: [
          debit(accounts.customerWallet(userId), amount),
          credit(accounts.providerClearing(intent.provider), amount),
        ],
      }),
    );
    if (fullyRefunded) {
      const locked = await tx.lockIntent(intent.id);
      if (locked) await tx.updateIntent(transition(locked, 'refunded'));
    }
    return intent.reference;
  }

  private async refundAtProvider(
    refundId: string,
    orderId: string,
    result: { amount: Money; providerReference: string | null },
  ): Promise<void> {
    if (!result.providerReference) return;
    try {
      const r = await this.deps.provider.refund({
        reference: result.providerReference,
        amount: result.amount,
      });
      await this.deps.store.transaction(async (tx) => {
        await tx.updateRefund(refundId, 'completed', r.providerRefundId);
        await this.emitCompleted(tx, refundId, orderId, result.amount, 'source');
      });
    } catch (err) {
      // DEBT(payments): failed provider refunds stay `pending_provider` — no retry job yet — add a BullMQ retry + ops alert.
      this.deps.logger.error({ err, refundId }, 'provider refund failed; left pending_provider');
    }
  }

  private emitCompleted(
    tx: PaymentsTx,
    refundId: string,
    orderId: string,
    amount: Money,
    destination: 'wallet' | 'source',
  ): Promise<void> {
    return tx.appendEvent({
      type: PAYMENTS_EVENTS.refundCompleted,
      aggregateType: 'order',
      aggregateId: orderId,
      payload: { refundId, orderId, amount: amount.toJSON(), destination },
    });
  }
}
