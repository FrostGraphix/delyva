import {
  type AcceptOrder,
  type AddCartLine,
  type AdminCancelOrder,
  type CancelOrder,
  type Cart,
  type CartList,
  CartListSchema,
  CartSchema,
  type CheckoutRequest,
  type ListAdminOrdersQuery,
  type ListMyOrdersQuery,
  type ListVendorOrdersQuery,
  type Order,
  type OrderPage,
  OrderPageSchema,
  OrderSchema,
  type RejectOrder,
  ROUTES,
  type UpdateCartLine,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { type ApiError, pathOf } from './client.js';

/** Minimal transport the ordering client needs (implemented by {@link DelyvaClient}). */
export interface OrderingTransport {
  /** Sends a request and validates the response. */
  request<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    schema: S | null,
    idempotencyKey?: string | null,
  ): Promise<z.infer<S>>;
}

function qs(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' || typeof v === 'number') q.set(k, String(v));
  }
  return q.size > 0 ? `?${q.toString()}` : '';
}

/** Typed ordering endpoints (carts, checkout, orders, vendor and ops actions). */
export class OrderingClient {
  /** @param t transport */
  constructor(private readonly t: OrderingTransport) {}

  /** GET /v1/carts */
  listCarts(): Promise<CartList> {
    return this.t.request('GET', ROUTES.listCarts.path, undefined, CartListSchema);
  }
  /** GET /v1/carts/{cartId} */
  getCart(cartId: string): Promise<Cart> {
    return this.t.request('GET', pathOf(ROUTES.getCart.path, { cartId }), undefined, CartSchema);
  }
  /** POST /v1/carts/lines (idempotent) */
  addCartLine(body: AddCartLine, idempotencyKey?: string): Promise<Cart> {
    return this.t.request(
      'POST',
      ROUTES.addCartLine.path,
      body,
      CartSchema,
      idempotencyKey ?? null,
    );
  }
  /** PATCH /v1/carts/{cartId}/lines/{lineId} */
  updateCartLine(
    cartId: string,
    lineId: string,
    body: UpdateCartLine,
    idempotencyKey?: string,
  ): Promise<Cart> {
    const path = pathOf(ROUTES.updateCartLine.path, { cartId, lineId });
    return this.t.request('PATCH', path, body, CartSchema, idempotencyKey ?? null);
  }
  /** DELETE /v1/carts/{cartId}/lines/{lineId} */
  removeCartLine(cartId: string, lineId: string, idempotencyKey?: string): Promise<Cart> {
    const path = pathOf(ROUTES.removeCartLine.path, { cartId, lineId });
    return this.t.request('DELETE', path, undefined, CartSchema, idempotencyKey ?? null);
  }
  /** DELETE /v1/carts/{cartId} */
  async deleteCart(cartId: string, idempotencyKey?: string): Promise<void> {
    await this.t.request(
      'DELETE',
      pathOf(ROUTES.deleteCart.path, { cartId }),
      undefined,
      null,
      idempotencyKey ?? null,
    );
  }
  /** POST /v1/orders — pass a key that is stable per checkout attempt so retries replay. */
  checkout(body: CheckoutRequest, idempotencyKey?: string): Promise<Order> {
    return this.t.request('POST', ROUTES.checkout.path, body, OrderSchema, idempotencyKey ?? null);
  }
  /** GET /v1/orders */
  listMyOrders(q: ListMyOrdersQuery = {}): Promise<OrderPage> {
    return this.t.request(
      'GET',
      `${ROUTES.listMyOrders.path}${qs({ limit: q.limit, cursor: q.cursor })}`,
      undefined,
      OrderPageSchema,
    );
  }
  /** GET /v1/orders/{id} */
  getOrder(id: string): Promise<Order> {
    return this.t.request('GET', pathOf(ROUTES.getOrder.path, { id }), undefined, OrderSchema);
  }
  /** POST /v1/orders/{id}/cancel */
  cancelOrder(id: string, body: CancelOrder = {}, idempotencyKey?: string): Promise<Order> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.cancelOrder.path, { id }),
      body,
      OrderSchema,
      idempotencyKey ?? null,
    );
  }
  /** POST /v1/orders/{id}/reorder */
  reorder(id: string, idempotencyKey?: string): Promise<Cart> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.reorder.path, { id }),
      undefined,
      CartSchema,
      idempotencyKey ?? null,
    );
  }
  /** GET /v1/vendors/{vendorId}/orders */
  listVendorOrders(vendorId: string, q: ListVendorOrdersQuery = {}): Promise<OrderPage> {
    const path = `${pathOf(ROUTES.listVendorOrders.path, { vendorId })}${qs({ status: q.status, limit: q.limit, cursor: q.cursor })}`;
    return this.t.request('GET', path, undefined, OrderPageSchema);
  }
  /** POST /v1/vendor-orders/{id}/accept */
  acceptVendorOrder(id: string, body: AcceptOrder, idempotencyKey?: string): Promise<Order> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.acceptVendorOrder.path, { id }),
      body,
      OrderSchema,
      idempotencyKey ?? null,
    );
  }
  /** POST /v1/vendor-orders/{id}/reject */
  rejectVendorOrder(id: string, body: RejectOrder, idempotencyKey?: string): Promise<Order> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.rejectVendorOrder.path, { id }),
      body,
      OrderSchema,
      idempotencyKey ?? null,
    );
  }
  /** POST /v1/vendor-orders/{id}/preparing */
  markVendorOrderPreparing(id: string, idempotencyKey?: string): Promise<Order> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.markVendorOrderPreparing.path, { id }),
      undefined,
      OrderSchema,
      idempotencyKey ?? null,
    );
  }
  /** POST /v1/vendor-orders/{id}/ready */
  markVendorOrderReady(id: string, idempotencyKey?: string): Promise<Order> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.markVendorOrderReady.path, { id }),
      undefined,
      OrderSchema,
      idempotencyKey ?? null,
    );
  }
  /** GET /v1/admin/orders */
  listAdminOrders(q: ListAdminOrdersQuery = {}): Promise<OrderPage> {
    const path = `${ROUTES.listAdminOrders.path}${qs({ status: q.status, vendorId: q.vendorId, customerId: q.customerId, from: q.from, to: q.to, limit: q.limit, cursor: q.cursor })}`;
    return this.t.request('GET', path, undefined, OrderPageSchema);
  }
  /** POST /v1/admin/orders/{id}/cancel */
  adminCancelOrder(id: string, body: AdminCancelOrder, idempotencyKey?: string): Promise<Order> {
    return this.t.request(
      'POST',
      pathOf(ROUTES.adminCancelOrder.path, { id }),
      body,
      OrderSchema,
      idempotencyKey ?? null,
    );
  }
}

/** Query keys for ordering. */
export const orderingKeys = {
  all: ['ordering'] as const,
  carts: () => [...orderingKeys.all, 'carts'] as const,
  cart: (id: string) => [...orderingKeys.all, 'cart', id] as const,
  myOrders: (cursor?: string) => [...orderingKeys.all, 'orders', cursor ?? null] as const,
  order: (id: string) => [...orderingKeys.all, 'order', id] as const,
  vendorOrders: (vendorId: string, status?: string) =>
    [...orderingKeys.all, 'vendor', vendorId, status ?? null] as const,
};

/** The caller's carts. */
export function useCarts(c: OrderingClient): UseQueryResult<CartList, ApiError> {
  return useQuery({ queryKey: orderingKeys.carts(), queryFn: () => c.listCarts() });
}

/** Adds a cart line; the server's cart (with `version`) replaces the optimistic one. */
export function useAddCartLine(
  c: OrderingClient,
): UseMutationResult<Cart, ApiError, AddCartLine & { idempotencyKey?: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...orderingKeys.all, 'add-line'],
    mutationFn: ({ idempotencyKey, ...body }) => c.addCartLine(body, idempotencyKey),
    onSuccess: (cart) => {
      qc.setQueryData(orderingKeys.cart(cart.id), cart);
      void qc.invalidateQueries({ queryKey: orderingKeys.carts() });
    },
  });
}

/** Checkout (pass a stable idempotency key per attempt). */
export function useCheckout(
  c: OrderingClient,
): UseMutationResult<Order, ApiError, CheckoutRequest & { idempotencyKey: string }> {
  return useMutation({
    mutationKey: [...orderingKeys.all, 'checkout'],
    mutationFn: ({ idempotencyKey, ...body }) => c.checkout(body, idempotencyKey),
  });
}

/** One order (poll every 10 s as the realtime fallback). */
export function useOrder(
  c: OrderingClient,
  id: string,
  pollMs = 10_000,
): UseQueryResult<Order, ApiError> {
  return useQuery({
    queryKey: orderingKeys.order(id),
    queryFn: () => c.getOrder(id),
    refetchInterval: pollMs,
  });
}

/** The caller's orders. */
export function useMyOrders(
  c: OrderingClient,
  cursor?: string,
): UseQueryResult<OrderPage, ApiError> {
  return useQuery({
    queryKey: orderingKeys.myOrders(cursor),
    queryFn: () => c.listMyOrders(cursor ? { cursor } : {}),
  });
}

/** A vendor's orders (filter by status). */
export function useVendorOrders(
  c: OrderingClient,
  vendorId: string,
  status?: ListVendorOrdersQuery['status'],
): UseQueryResult<OrderPage, ApiError> {
  return useQuery({
    queryKey: orderingKeys.vendorOrders(vendorId, status),
    queryFn: () => c.listVendorOrders(vendorId, status ? { status } : {}),
  });
}

/** Vendor accept. */
export function useAcceptVendorOrder(
  c: OrderingClient,
): UseMutationResult<
  Order,
  ApiError,
  { id: string; prepMinutes: number; idempotencyKey?: string }
> {
  return useMutation({
    mutationKey: [...orderingKeys.all, 'accept'],
    mutationFn: ({ id, prepMinutes, idempotencyKey }) =>
      c.acceptVendorOrder(id, { prepMinutes }, idempotencyKey),
  });
}

/** Customer cancel. */
export function useCancelOrder(
  c: OrderingClient,
): UseMutationResult<Order, ApiError, { id: string; reason?: string; idempotencyKey?: string }> {
  return useMutation({
    mutationKey: [...orderingKeys.all, 'cancel'],
    mutationFn: ({ id, reason, idempotencyKey }) =>
      c.cancelOrder(id, reason ? { reason } : {}, idempotencyKey),
  });
}
