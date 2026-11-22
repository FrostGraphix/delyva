'use client';

import type { OrderSummary } from '@delyva/contracts';
import { WalletIcon } from '@delyva/icons/web';
import { EmptyPanel, ErrorState, SkeletonList } from '@delyva/ui-web';
import { useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { type ReactNode, useState } from 'react';
import { browserClient } from '../../../lib/client/api';
import { orderKeys } from '../../../lib/client/orders';
import { useCurrentVendor } from '../../../lib/client/providers';
import { t } from '../../../lib/i18n';
import { formatMoney, sumMoney } from '../../../lib/money';

const DATE = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

const COLUMNS: ColumnDef<OrderSummary>[] = [
  { id: 'ref', header: () => t('earnings.col.ref'), accessorFn: (o) => `#${o.ref}` },
  {
    id: 'date',
    header: () => t('earnings.col.date'),
    accessorFn: (o) => o.createdAt,
    cell: (c) => DATE.format(new Date(c.getValue<string>())),
  },
  { id: 'items', header: () => t('earnings.col.items'), accessorFn: (o) => o.itemCount },
  {
    id: 'total',
    header: () => t('earnings.col.total'),
    accessorFn: (o) => o.total.amountMinor,
    cell: (c) => formatMoney(c.row.original.total),
  },
];

/**
 * Earnings: delivered orders and gross value.
 * DEBT(payments): no vendor payout/ledger read endpoint — net earnings and payout history cannot be shown — add GET /v1/vendors/{id}/payouts and /balance in the payments context.
 */
export default function EarningsPage(): ReactNode {
  const vendor = useCurrentVendor();
  const q = useQuery({
    queryKey: [...orderKeys.list(vendor.id, 'DELIVERED'), 'earnings'],
    queryFn: () =>
      browserClient().ordering.listVendorOrders(vendor.id, { status: 'DELIVERED', limit: 50 }),
  });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const table = useReactTable({
    data: q.data?.items ?? [],
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (q.isPending) return <SkeletonList rows={4} label={t('common.loading')} />;
  if (q.isError) {
    return (
      <ErrorState
        title={t('earnings.loadError')}
        action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
      />
    );
  }
  const orders = q.data.items;
  const gross = sumMoney(
    orders.map((o) => o.total),
    'NGN',
  );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-h1 font-extrabold">{t('earnings.title')}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label={t('earnings.delivered')} value={String(orders.length)} />
        <Stat label={t('earnings.gross')} value={formatMoney(gross)} />
      </div>
      <p className="rounded-2xl border border-line bg-surface p-4 text-body text-text-muted">
        {t('earnings.payoutsDebt')}
      </p>
      <h2 className="font-heading text-h2 font-bold">{t('earnings.recent')}</h2>
      {orders.length === 0 ? (
        <EmptyPanel title={t('earnings.empty')} icon={<WalletIcon size={32} />} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-body">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-line">
                  {hg.headers.map((h) => {
                    const dir = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={
                          dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
                        }
                        className="p-3"
                      >
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="min-h-12 font-semibold focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  {r.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="font-heading text-h1 font-extrabold">{value}</p>
    </div>
  );
}
