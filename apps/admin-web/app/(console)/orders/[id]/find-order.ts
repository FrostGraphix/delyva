import type { ListAdminOrdersQuery, OrderPage, OrderSummary } from '@delyva/contracts';

/** Max pages scanned (50 orders each) before giving up. */
export const MAX_SCAN_PAGES = 10;

/**
 * Finds an order summary by id by walking the admin list newest-first.
 * DEBT(admin): no `GET /v1/admin/orders/{id}` — detail, items and timeline are unavailable and
 * older orders are not found — add the endpoint (ops/support, with timeline) in ordering.
 */
export async function findOrderSummary(
  id: string,
  list: (q: ListAdminOrdersQuery) => Promise<OrderPage>,
): Promise<OrderSummary | null> {
  let cursor: string | undefined;
  for (let i = 0; i < MAX_SCAN_PAGES; i += 1) {
    const page = await list({ limit: 50, cursor });
    const hit = page.items.find((o) => o.id === id);
    if (hit) return hit;
    if (!page.nextCursor) return null;
    cursor = page.nextCursor;
  }
  return null;
}
