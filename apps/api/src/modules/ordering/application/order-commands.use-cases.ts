import type { AcceptOrder, Order } from '@delyva/contracts';
import { OrderingError } from '../domain/ordering-errors.js';
import { type OrderAudience, toOrderDto } from './order-dto.js';
import { type OrderLifecycle, type TransitionStep, withRefund } from './order-lifecycle.js';
import type { CatalogPort, Clock, OrderCodes, OrderRecord, OrderStore } from './ports.js';

/** Collaborators shared by the order commands. */
export interface OrderCommandDeps {
  readonly orders: OrderStore;
  readonly lifecycle: OrderLifecycle;
  readonly catalog: Pick<CatalogPort, 'memberRole'>;
  readonly codes: OrderCodes;
  readonly clock: Clock;
}

/** Renders an order for an audience. */
export async function renderOrder(
  deps: Pick<OrderCommandDeps, 'orders' | 'codes'>,
  order: OrderRecord,
  audience: OrderAudience,
): Promise<Order> {
  const [items, history] = await Promise.all([
    deps.orders.items(order.id),
    deps.orders.history(order.id),
  ]);
  return toOrderDto(order, items, history, audience, deps.codes);
}

/** Loads an order the vendor user belongs to; foreign or unknown orders are 404 (IDOR). */
export async function vendorOrder(
  deps: Pick<OrderCommandDeps, 'orders' | 'catalog'>,
  userId: string,
  orderId: string,
): Promise<OrderRecord> {
  const order = await deps.orders.findById(orderId);
  if (!order || (await deps.catalog.memberRole(order.vendorId, userId)) === null) {
    throw new OrderingError('not_found', 'Order not found.');
  }
  return order;
}

/** Vendor commands: accept (prep time), reject (reason), preparing, ready. Members only. */
export class VendorOrderActions {
  /** @param deps collaborators */
  constructor(private readonly deps: OrderCommandDeps) {}

  /** One order of a vendor the caller belongs to, rendered for the vendor audience (foreign → 404). */
  async get(userId: string, orderId: string): Promise<Order> {
    const order = await vendorOrder(this.deps, userId, orderId);
    return renderOrder(this.deps, order, 'vendor');
  }

  /** PLACED → VENDOR_ACCEPTED with prep time; emits the event dispatch consumes. */
  async accept(userId: string, orderId: string, input: AcceptOrder): Promise<Order> {
    await vendorOrder(this.deps, userId, orderId);
    const readyAt = new Date(this.deps.clock.now().getTime() + input.prepMinutes * 60_000);
    return this.move(orderId, () => [
      {
        to: 'VENDOR_ACCEPTED',
        actorType: 'vendor',
        actorId: userId,
        patch: { prepMinutes: input.prepMinutes, readyAt },
      },
    ]);
  }

  /** PLACED → VENDOR_REJECTED → REFUND_PENDING → REFUNDED (hold released). */
  async reject(userId: string, orderId: string, reason: string): Promise<Order> {
    await vendorOrder(this.deps, userId, orderId);
    return this.move(orderId, (o) =>
      withRefund(o, [{ to: 'VENDOR_REJECTED', actorType: 'vendor', actorId: userId, reason }]),
    );
  }

  /** VENDOR_ACCEPTED → PREPARING. */
  async preparing(userId: string, orderId: string): Promise<Order> {
    await vendorOrder(this.deps, userId, orderId);
    return this.move(orderId, () => [{ to: 'PREPARING', actorType: 'vendor', actorId: userId }]);
  }

  /**
   * (VENDOR_ACCEPTED →) PREPARING → READY_FOR_PICKUP; when dispatch already assigned a rider,
   * the order continues to RIDER_ASSIGNED in the same transaction.
   */
  async ready(userId: string, orderId: string): Promise<Order> {
    await vendorOrder(this.deps, userId, orderId);
    return this.move(orderId, (o) => {
      const steps: TransitionStep[] = [];
      if (o.status === 'VENDOR_ACCEPTED')
        steps.push({ to: 'PREPARING', actorType: 'vendor', actorId: userId });
      steps.push({ to: 'READY_FOR_PICKUP', actorType: 'vendor', actorId: userId });
      if (o.riderId) {
        steps.push({
          to: 'RIDER_ASSIGNED',
          actorType: 'system',
          actorId: null,
          reason: 'rider_assigned_during_prep',
        });
      }
      return steps;
    });
  }

  private async move(orderId: string, plan: (o: OrderRecord) => TransitionStep[]): Promise<Order> {
    const order = await this.deps.lifecycle.run(orderId, plan);
    return renderOrder(this.deps, order, 'vendor');
  }
}

/** Customer cancel: only before PREPARING (the state machine rejects anything later). */
export class CancelOrderByCustomer {
  /** @param deps collaborators */
  constructor(private readonly deps: OrderCommandDeps) {}

  /** @throws OrderingError not_found (foreign/unknown) | conflict (too late) */
  async execute(userId: string, orderId: string, reason: string | undefined): Promise<Order> {
    const order = await this.deps.orders.findById(orderId);
    if (order?.customerId !== userId) throw new OrderingError('not_found', 'Order not found.');
    const after = await this.deps.lifecycle.run(orderId, (o) =>
      withRefund(o, [
        {
          to: 'CANCELLED_BY_CUSTOMER',
          actorType: 'customer',
          actorId: userId,
          reason: reason ?? null,
        },
      ]),
    );
    return renderOrder(this.deps, after, 'customer');
  }
}

/** Ops cancel with a mandatory reason; the event (actor + reason) is the audit record. */
export class CancelOrderByOps {
  /** @param deps collaborators */
  constructor(private readonly deps: OrderCommandDeps) {}

  /** @throws OrderingError not_found | conflict */
  async execute(opsUserId: string, orderId: string, reason: string): Promise<Order> {
    const after = await this.deps.lifecycle.run(orderId, (o) =>
      withRefund(o, [{ to: 'CANCELLED_BY_OPS', actorType: 'ops', actorId: opsUserId, reason }]),
    );
    return renderOrder(this.deps, after, 'ops');
  }
}

/** System job: auto-reject a PLACED order the vendor did not answer in time. */
export class AutoRejectOrder {
  /** @param lifecycle order lifecycle */
  constructor(private readonly lifecycle: OrderLifecycle) {}

  /** No-op unless the order is still PLACED. Returns the resulting status. */
  async execute(orderId: string): Promise<string> {
    const after = await this.lifecycle.run(orderId, (o) =>
      o.status === 'PLACED'
        ? withRefund(o, [
            { to: 'VENDOR_REJECTED', actorType: 'system', actorId: null, reason: 'vendor_timeout' },
          ])
        : [],
    );
    return after.status;
  }
}
