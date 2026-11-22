'use client';
import { ORDER_STATUSES, type OrderStatus, type OrderSummary } from '@delyva/contracts';
import { Button, Card, SelectField, TextField } from '@delyva/ui-web';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { adminClient } from '@/lib/client/api';
import { LIVE_REFRESH_MS, adminKeys } from '@/lib/client/queries';
import { useSession } from '@/lib/client/session';
import { t } from '@/lib/i18n';
import { canAccess } from '@/lib/roles';
import { OrdersTable } from './orders-table';
import { RidersPanel } from './riders-panel';

const STATUS_OPTIONS = [
  { value: '', label: t('live.allStatuses') },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: t(`order.status.${s}`) })),
];

function useOrderPages(status: OrderStatus | undefined, fromDate: string) {
  const from = fromDate ? new Date(`${fromDate}T00:00:00+01:00`).toISOString() : undefined;
  const q = { status, from, limit: 20 };
  return useInfiniteQuery({
    queryKey: [...adminKeys.orders(q), 'pages'],
    queryFn: ({ pageParam }) => adminClient.ordering.listAdminOrders({ ...q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

/** A03 · Live operations: filterable orders + online riders map. */
export default function LiveOpsPage(): ReactNode {
  const roles = useSession().data?.roles ?? [];
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const pages = useOrderPages(status || undefined, fromDate);
  const orders = useMemo<OrderSummary[]>(
    () => pages.data?.pages.flatMap((p) => p.items) ?? [],
    [pages.data],
  );
  const clear = (): void => {
    setStatus('');
    setFromDate('');
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('live.title')} subtitle={t('live.subtitle')} />
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={t('live.orders')}>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <SelectField
              id="status"
              label={t('live.status')}
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as OrderStatus | '');
              }}
            />
            <TextField
              id="from"
              type="date"
              label={t('live.from')}
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
              }}
            />
          </div>
          <QueryView
            query={pages}
            what={t('live.orders')}
            isEmpty={() => orders.length === 0}
            empty={
              <EmptyBlock
                title={t('live.ordersEmpty')}
                body={t('live.ordersEmptyBody')}
                action={
                  <Button variant="soft" size="sm" onClick={clear}>
                    {t('live.clearFilters')}
                  </Button>
                }
              />
            }
          >
            {() => (
              <div className="flex flex-col gap-4">
                <OrdersTable orders={orders} />
                {pages.hasNextPage ? (
                  <Button
                    variant="soft"
                    size="sm"
                    loading={pages.isFetchingNextPage}
                    onClick={() => void pages.fetchNextPage()}
                  >
                    {t('common.loadMore')}
                  </Button>
                ) : null}
              </div>
            )}
          </QueryView>
        </Card>
        {canAccess('dispatch', roles) ? <RidersPanel /> : null}
      </div>
    </div>
  );
}
