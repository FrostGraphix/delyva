'use client';

import type { Order, OrderStatus, OrderSummary } from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { browserClient } from './api';

/** Board columns and the statuses each one shows. */
export const BOARD_COLUMNS = {
  new: ['PLACED'],
  preparing: ['VENDOR_ACCEPTED', 'PREPARING'],
  ready: ['READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'RIDER_AT_VENDOR'],
} as const satisfies Record<string, readonly OrderStatus[]>;

/** A board column id. */
export type BoardColumn = keyof typeof BOARD_COLUMNS;

const BOARD_STATUSES: readonly OrderStatus[] = Object.values(BOARD_COLUMNS).flat();

/**
 * New orders are polled every 5 s because the API has no vendor-wide realtime room yet.
 * DEBT(realtime): no `vendor:<id>` socket room for new orders — vendors only learn of PLACED orders by polling — emit order.placed to a vendor room and drop the fast poll.
 */
export const NEW_ORDER_POLL_MS = 5_000;
/** Poll interval for other columns while the socket is down (10 s per ARCHITECTURE). */
export const FALLBACK_POLL_MS = 10_000;

/** Query keys. */
export const orderKeys = {
  board: (vendorId: string) => ['orders', vendorId] as const,
  list: (vendorId: string, status: OrderStatus) => ['orders', vendorId, status] as const,
  order: (id: string) => ['order', id] as const,
};

/** Board data: every live order of the vendor grouped by column, newest first. */
export interface BoardData {
  readonly columns: Record<BoardColumn, OrderSummary[]>;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/** Loads the board (one list query per status), polling per {@link NEW_ORDER_POLL_MS}. */
export function useBoard(vendorId: string, live: boolean): BoardData {
  const results = useQueries({
    queries: BOARD_STATUSES.map((status) => ({
      queryKey: orderKeys.list(vendorId, status),
      queryFn: () => browserClient().ordering.listVendorOrders(vendorId, { status, limit: 50 }),
      refetchInterval:
        status === 'PLACED' ? NEW_ORDER_POLL_MS : live ? FALLBACK_POLL_MS * 3 : FALLBACK_POLL_MS,
    })),
  });
  const byStatus = new Map<OrderStatus, OrderSummary[]>();
  BOARD_STATUSES.forEach((s, i) => byStatus.set(s, results[i]?.data?.items ?? []));
  const pick = (c: BoardColumn): OrderSummary[] =>
    BOARD_COLUMNS[c]
      .flatMap((s) => byStatus.get(s) ?? [])
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    columns: { new: pick('new'), preparing: pick('preparing'), ready: pick('ready') },
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    refetch: () => {
      for (const r of results) void r.refetch();
    },
  };
}

/** One order with items, timeline and pickup code. */
export function useOrder(id: string): UseQueryResult<Order> {
  return useQuery({
    queryKey: orderKeys.order(id),
    queryFn: () => browserClient().ordering.getVendorOrder(id),
  });
}

/** A vendor order action. */
export type OrderAction =
  | { readonly kind: 'accept'; readonly prepMinutes: number }
  | { readonly kind: 'reject'; readonly reason: string }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'ready' };

function run(id: string, a: OrderAction, key: string): Promise<Order> {
  const o = browserClient().ordering;
  switch (a.kind) {
    case 'accept':
      return o.acceptVendorOrder(id, { prepMinutes: a.prepMinutes }, key);
    case 'reject':
      return o.rejectVendorOrder(id, { reason: a.reason }, key);
    case 'preparing':
      return o.markVendorOrderPreparing(id, key);
    case 'ready':
      return o.markVendorOrderReady(id, key);
  }
}

/** Mutation for vendor actions; the caller passes a stable idempotency key per intent. */
export function useOrderAction(
  vendorId: string,
): UseMutationResult<Order, Error, { id: string; action: OrderAction; key: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, key }) => run(id, action, key),
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: orderKeys.board(vendorId) });
    },
  });
}

/** When the order entered PLACED (from the timeline), or null. */
export function placedAt(order: Order | undefined): Date | null {
  const e = order?.timeline.find((x) => x.status === 'PLACED');
  return e ? new Date(e.at) : null;
}

/** Auto-reject window from config; null hides the countdown. */
export function autoRejectSeconds(): number | null {
  const n = Number(process.env.NEXT_PUBLIC_AUTO_REJECT_SECONDS);
  return Number.isInteger(n) && n > 0 ? n : null;
}
