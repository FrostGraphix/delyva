import type { AdminDispatchRiderList, OrderPage, OrderStatus } from '@delyva/contracts';
import { t } from '@/lib/i18n';

const IN_PROGRESS: readonly OrderStatus[] = [
  'PLACED',
  'VENDOR_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'RIDER_AT_VENDOR',
  'PICKED_UP',
  'RIDER_AT_CUSTOMER',
];

/** Orders in one page; "50+" when more pages exist (no count endpoint, so never a guess). */
export function countOrders(page: OrderPage): string {
  const n = page.items.length;
  return page.nextCursor ? t('overview.ordersTodayMore', { count: n }) : String(n);
}

/** Orders between PLACED and RIDER_AT_CUSTOMER in a page. */
export function countInProgress(page: OrderPage): number {
  return page.items.filter((o) => IN_PROGRESS.includes(o.status)).length;
}

/** Online riders (incl. on a trip) and those on a trip. */
export function countRiders(list: AdminDispatchRiderList): { online: number; onTrip: number } {
  const online = list.items.filter((r) => r.status !== 'offline').length;
  const onTrip = list.items.filter((r) => r.status === 'on_trip').length;
  return { online, onTrip };
}
