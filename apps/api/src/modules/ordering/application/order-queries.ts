import type { Cart, ListAdminOrdersQuery, Order, OrderPage, OrderStatus } from '@delyva/contracts';
import { addLine, type CartLineState } from '../domain/cart.js';
import { OrderingError } from '../domain/ordering-errors.js';
import { cartDto } from './cart.use-cases.js';
import { decodeCursor, toPage } from './order-dto.js';
import { renderOrder } from './order-commands.use-cases.js';
import type {
  CartStore,
  CatalogPort,
  Clock,
  OrderCodes,
  OrderFilter,
  OrderRecord,
  OrderStore,
} from './ports.js';

/** Collaborators of the order queries. */
export interface OrderQueryDeps {
  readonly orders: OrderStore;
  readonly carts: CartStore;
  readonly catalog: CatalogPort;
  readonly codes: OrderCodes;
  readonly clock: Clock;
}

async function page(
  deps: OrderQueryDeps,
  filter: OrderFilter,
  q: { limit?: number | undefined; cursor?: string | undefined },
): Promise<OrderPage> {
  const limit = q.limit ?? 20;
  const rows = await deps.orders.list(filter, limit + 1, decodeCursor(q.cursor));
  return toPage(rows, limit);
}

/** Customer, vendor and ops order reads (ownership enforced here, not only in guards). */
export class OrderQueries {
  /** @param deps collaborators */
  constructor(private readonly deps: OrderQueryDeps) {}

  /** The caller's orders. */
  mine(userId: string, q: { limit?: number; cursor?: string | undefined }): Promise<OrderPage> {
    return page(this.deps, { customerId: userId }, q);
  }

  /** One of the caller's orders (foreign → 404). */
  async mineById(userId: string, orderId: string): Promise<Order> {
    const order = await this.deps.orders.findById(orderId);
    if (order?.customerId !== userId) throw new OrderingError('not_found', 'Order not found.');
    return renderOrder(this.deps, order, 'customer');
  }

  /** Orders of a vendor the caller belongs to. @throws OrderingError forbidden */
  async forVendor(
    userId: string,
    vendorId: string,
    q: { status?: OrderStatus | undefined; limit?: number; cursor?: string | undefined },
  ): Promise<OrderPage> {
    if ((await this.deps.catalog.memberRole(vendorId, userId)) === null) {
      throw new OrderingError('forbidden', 'You do not have access to this vendor.');
    }
    return page(this.deps, { vendorId, status: q.status }, q);
  }

  /** Ops listing with filters. */
  admin(q: ListAdminOrdersQuery): Promise<OrderPage> {
    return page(
      this.deps,
      {
        status: q.status,
        vendorId: q.vendorId,
        customerId: q.customerId,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      },
      { limit: q.limit === undefined ? undefined : Number(q.limit), cursor: q.cursor },
    );
  }

  /** Copies a past order's lines into the caller's cart for that branch (live prices apply). */
  async reorder(userId: string, orderId: string): Promise<Cart> {
    const order = await this.deps.orders.findById(orderId);
    if (order?.customerId !== userId) throw new OrderingError('not_found', 'Order not found.');
    const branch = await this.deps.catalog.branch(order.branchId);
    if (branch?.acceptingOrders !== true) {
      throw new OrderingError('conflict', 'This vendor is not taking orders right now.');
    }
    const items = await this.deps.orders.items(orderId);
    const existing = await this.deps.carts.findByBranch(userId, order.branchId);
    let lines: CartLineState[] = [...(existing?.lines ?? [])];
    for (const i of items) {
      lines = addLine(lines, {
        id: this.deps.clock.uuid(),
        itemId: i.itemId,
        quantity: i.quantity,
        optionIds: i.options.map((o) => o.id),
      });
    }
    const cart = this.newCart(userId, order, existing?.id, existing?.version ?? 0, lines);
    if (!(await this.deps.carts.save(cart, existing ? existing.version : null))) {
      throw new OrderingError('conflict', 'The cart changed concurrently; please retry.');
    }
    return cartDto(cart, this.deps.catalog);
  }

  private newCart(
    userId: string,
    order: OrderRecord,
    id: string | undefined,
    version: number,
    lines: CartLineState[],
  ) {
    return {
      id: id ?? this.deps.clock.uuid(),
      userId,
      vendorId: order.vendorId,
      branchId: order.branchId,
      version: version + 1,
      lines,
      updatedAt: this.deps.clock.now(),
    };
  }
}

/** Realtime order-room authorizer: customer, assigned rider and vendor members (deny otherwise). */
export class OrderRoomAccess {
  /** @param deps order reads and vendor membership */
  constructor(
    private readonly deps: {
      orders: Pick<OrderStore, 'findById'>;
      catalog: Pick<CatalogPort, 'memberRole'>;
    },
  ) {}

  /** True only for participants of the order. */
  async canJoin(principal: { userId: string }, orderId: string): Promise<boolean> {
    const order = await this.deps.orders.findById(orderId).catch(() => null);
    if (!order) return false;
    if (order.customerId === principal.userId || order.riderId === principal.userId) return true;
    return (await this.deps.catalog.memberRole(order.vendorId, principal.userId)) !== null;
  }
}
