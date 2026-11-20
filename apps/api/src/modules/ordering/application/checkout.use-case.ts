import type { CheckoutRequest, Order } from '@delyva/contracts';
import { Money } from '@delyva/utils';
import { assertTotalsBalance, pricingZoneCode } from '../domain/order-money.js';
import { OrderingError } from '../domain/ordering-errors.js';
import { applyStep, type OrderLifecycle, statusEvent } from './order-lifecycle.js';
import { toOrderDto } from './order-dto.js';
import type {
  CartStore,
  CatalogPort,
  Clock,
  GeoPort,
  OrderCodes,
  OrderingBranchView,
  OrderItemRecord,
  OrderRecord,
  OrderStore,
  PaymentsPort,
  PricedLine,
  PricingPort,
  QuoteView,
} from './ports.js';

/** Collaborators of {@link Checkout}. */
export interface CheckoutDeps {
  readonly orders: OrderStore;
  readonly carts: CartStore;
  readonly catalog: CatalogPort;
  readonly geo: GeoPort;
  readonly pricing: PricingPort;
  readonly payments: Pick<PaymentsPort, 'createIntentForOrder'>;
  readonly lifecycle: OrderLifecycle;
  readonly codes: OrderCodes;
  readonly clock: Clock;
}

/** Everything priced and validated before anything is written. */
interface PricedCheckout {
  readonly branch: OrderingBranchView;
  readonly dropoff: { lat: number; lng: number };
  readonly lines: readonly PricedLine[];
  readonly quote: QuoteView;
  readonly etaMinutes: number;
}

/**
 * Command `POST /v1/orders`: re-prices the cart from the catalog + pricing (client prices are
 * never read), validates vendor/zone, redeems the promo in the order transaction and reserves
 * money: wallet → hold, order PLACED immediately; card/transfer → provider intent, order
 * PENDING_PAYMENT until `payments.intent.succeeded`. Idempotent per (customer, Idempotency-Key).
 */
export class Checkout {
  /** @param deps collaborators */
  constructor(private readonly deps: CheckoutDeps) {}

  /** Executes the command. @throws OrderingError | PricingError | PaymentsError */
  async execute(userId: string, input: CheckoutRequest, idempotencyKey: string): Promise<Order> {
    const replay = await this.deps.orders.findByIdempotencyKey(userId, idempotencyKey);
    if (replay) return this.view(replay);
    const priced = await this.price(userId, input);
    const order = this.newOrder(userId, input, priced, idempotencyKey);
    const items = priced.lines.map(toItem);
    const placed = await this.persist(order, items, input);
    if (input.paymentMethod !== 'wallet') return this.view(await this.startProviderPayment(placed));
    return this.view(placed);
  }

  private async price(userId: string, input: CheckoutRequest): Promise<PricedCheckout> {
    const cart = await this.deps.carts.findForUser(userId, input.cartId);
    if (!cart || cart.lines.length === 0) throw new OrderingError('not_found', 'Cart not found.');
    const branch = await this.deps.catalog.branch(cart.branchId);
    if (branch?.acceptingOrders !== true) {
      throw new OrderingError('conflict', 'This vendor is not taking orders right now.');
    }
    const dropoff = await this.deps.geo.addressOf(userId, input.addressId);
    if (!dropoff) throw new OrderingError('not_found', 'Address not found.');
    const zoneCode = await this.zoneCode(branch, dropoff);
    const lines = await this.deps.catalog.priceSelections(branch.vendorId, cart.lines);
    const problem = lines.find((l) => l.problem !== null);
    if (problem)
      throw new OrderingError('conflict', `Cart needs attention: ${problem.problem ?? ''}`);
    const quote = await this.deps.pricing.quote({
      userId,
      zoneCode,
      pickup: branch.location,
      dropoff,
      lines: lines.map((l) => ({
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
        modifierDeltasMinor: l.options.map((o) => o.priceDeltaMinor),
      })),
      promoCode: input.promoCode,
    });
    if (input.promoCode && quote.promo?.applied !== true) {
      const reason = quote.promo?.reason ?? 'not_found';
      throw new OrderingError('promo_ineligible', `Promo cannot be applied: ${reason}.`);
    }
    assertTotalsBalance(quote.totals);
    const eta = await this.deps.geo.deliveryEstimate(branch.location, dropoff, branch.prepMinutes);
    return { branch, dropoff, lines, quote, etaMinutes: eta.etaMinutes };
  }

  /** The branch's zone must cover the drop-off; its city maps to the pricing zone code. */
  private async zoneCode(
    branch: OrderingBranchView,
    dropoff: { lat: number; lng: number },
  ): Promise<string> {
    const zones = await this.deps.geo.zonesAt(dropoff);
    const zone = zones.find((z) => z.id === branch.zoneId);
    if (!zone) {
      throw new OrderingError(
        'zone_not_serviceable',
        'This vendor does not deliver to that address.',
      );
    }
    return pricingZoneCode(zone.city);
  }

  private newOrder(
    userId: string,
    input: CheckoutRequest,
    p: PricedCheckout,
    idempotencyKey: string,
  ): OrderRecord {
    const { clock, codes } = this.deps;
    const id = clock.uuid();
    const now = clock.now();
    return {
      id,
      customerId: userId,
      vendorId: p.branch.vendorId,
      vendorName: p.branch.vendorName,
      branchId: p.branch.branchId,
      status: 'PENDING_PAYMENT',
      paymentMethod: input.paymentMethod,
      paymentIntentId: null,
      paymentAuthorizationUrl: null,
      totals: p.quote.totals,
      promoCode: p.quote.promo?.applied ? p.quote.promo.code : null,
      pickup: p.branch.location,
      dropoff: p.dropoff,
      prepMinutes: null,
      readyAt: null,
      etaMinutes: p.etaMinutes,
      riderId: null,
      deliveryOtpHash: codes.hash(id, 'delivery', codes.deliveryOtp(id)),
      pickupCodeHash: codes.hash(id, 'pickup', codes.pickupCode(id)),
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * One transaction: order + lines + history + event, promo redemption (SAVEPOINT), cart
   * deletion and — for wallet — the hold, then PLACED. Any failure rolls everything back.
   */
  private async persist(
    order: OrderRecord,
    items: readonly OrderItemRecord[],
    input: CheckoutRequest,
  ): Promise<OrderRecord> {
    const at = order.createdAt;
    const created = { to: order.status, actorType: 'customer', actorId: order.customerId } as const;
    const result = await this.deps.orders.transaction(async (tx) => {
      await tx.insertOrder(order, items);
      await tx.appendHistory(order.id, {
        status: order.status,
        at,
        actorType: 'customer',
        actorId: order.customerId,
        reason: null,
      });
      await tx.appendEvent(statusEvent(order, null, created, at));
      if (order.promoCode) {
        await tx.redeemPromo({
          code: order.promoCode,
          userId: order.customerId,
          orderId: order.id,
          itemsSubtotalMinor: order.totals.itemsSubtotal,
          discountMinor: order.totals.discount,
        });
      }
      await tx.deleteCart(order.customerId, input.cartId);
      if (order.paymentMethod !== 'wallet') return order;
      const intent = await this.deps.payments.createIntentForOrder({
        orderId: order.id,
        userId: order.customerId,
        amount: Money.ofMinor(order.totals.total, 'NGN'),
        method: 'wallet',
      });
      return applyStep(
        tx,
        order,
        {
          to: 'PLACED',
          actorType: 'customer',
          actorId: order.customerId,
          reason: 'wallet_hold',
          patch: { paymentIntentId: intent.id },
        },
        at,
      );
    });
    if (result.status === 'PLACED') {
      return this.deps.lifecycle.afterCommit(
        order,
        result,
        [{ to: 'PLACED', actorType: 'customer', actorId: order.customerId }],
        at,
      );
    }
    return result;
  }

  /** Card/transfer: provider checkout after commit; a failure marks the order PAYMENT_FAILED. */
  private async startProviderPayment(order: OrderRecord): Promise<OrderRecord> {
    try {
      const intent = await this.deps.payments.createIntentForOrder({
        orderId: order.id,
        userId: order.customerId,
        amount: Money.ofMinor(order.totals.total, 'NGN'),
        method: order.paymentMethod,
      });
      return await this.deps.orders.transaction(async (tx) => {
        const patch = {
          paymentIntentId: intent.id,
          paymentAuthorizationUrl: intent.authorizationUrl,
        };
        await tx.updateOrder(order.id, patch, this.deps.clock.now());
        return { ...order, ...patch };
      });
    } catch (err) {
      await this.deps.lifecycle.run(order.id, (o) =>
        o.status === 'PENDING_PAYMENT'
          ? [
              {
                to: 'PAYMENT_FAILED',
                actorType: 'system',
                actorId: null,
                reason: 'payment_start_failed',
              },
            ]
          : [],
      );
      throw err;
    }
  }

  private async view(order: OrderRecord): Promise<Order> {
    const [items, history] = await Promise.all([
      this.deps.orders.items(order.id),
      this.deps.orders.history(order.id),
    ]);
    const current = (await this.deps.orders.findById(order.id)) ?? order;
    return toOrderDto(current, items, history, 'customer', this.deps.codes);
  }
}

function toItem(l: PricedLine): OrderItemRecord {
  return {
    itemId: l.itemId,
    name: l.name,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    options: l.options,
  };
}
