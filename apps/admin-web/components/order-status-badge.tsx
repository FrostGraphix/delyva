import type { OrderStatus } from '@delyva/contracts';
import { Badge, type BadgeTone } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

const DANGER: readonly OrderStatus[] = [
  'PAYMENT_FAILED',
  'VENDOR_REJECTED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OPS',
  'UNDELIVERABLE',
];

/** Tone of an order status (the label always carries the meaning too). */
export function orderStatusTone(status: OrderStatus): BadgeTone {
  if (status === 'DELIVERED') return 'success';
  if (DANGER.includes(status)) return 'danger';
  if (status === 'PENDING_PAYMENT' || status === 'REFUND_PENDING') return 'warning';
  if (status === 'REFUNDED') return 'neutral';
  return 'info';
}

/** Order status pill. */
export function OrderStatusBadge({ status }: { readonly status: OrderStatus }): ReactNode {
  return <Badge tone={orderStatusTone(status)}>{t(`order.status.${status}`)}</Badge>;
}
