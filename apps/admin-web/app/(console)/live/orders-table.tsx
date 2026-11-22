'use client';
import type { OrderSummary } from '@delyva/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';

const col = columnsFor<OrderSummary>();

/** Columns of the live orders table (module-level: stable for TanStack Table). */
export const ORDER_COLUMNS = col.columns([
  col.accessor('ref', {
    header: () => t('live.col.ref'),
    cell: (c) => (
      <Link
        href={`/orders/${c.row.original.id}`}
        aria-label={t('live.openOrder', { ref: c.getValue() })}
        className="font-semibold text-accent-text underline-offset-2 hover:underline"
      >
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor('vendorName', { header: () => t('live.col.vendor') }),
  col.accessor('status', {
    header: () => t('live.col.status'),
    cell: (c) => <OrderStatusBadge status={c.getValue()} />,
  }),
  col.accessor('itemCount', { header: () => t('live.col.items') }),
  col.accessor('total', {
    header: () => t('live.col.total'),
    cell: (c) => formatMoney(c.getValue()),
  }),
  col.accessor('createdAt', {
    header: () => t('live.col.created'),
    cell: (c) => formatDateTime(c.getValue()),
  }),
]) as Columns<OrderSummary>;

/** Orders table. */
export function OrdersTable({ orders }: { readonly orders: readonly OrderSummary[] }): ReactNode {
  return (
    <DataTable
      caption={t('live.orders')}
      columns={ORDER_COLUMNS}
      data={orders}
      rowId={(o) => o.id}
    />
  );
}
