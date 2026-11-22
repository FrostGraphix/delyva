'use client';
import { Alert, Card } from '@delyva/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { use, type ReactNode } from 'react';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageHeader } from '@/components/page-header';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { adminClient } from '@/lib/client/api';
import { LIVE_REFRESH_MS, adminKeys } from '@/lib/client/queries';
import { useSession } from '@/lib/client/session';
import { formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { canAccess } from '@/lib/roles';
import { findOrderSummary } from './find-order';
import { OrderActions } from './order-actions';

function Row({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body font-semibold text-text">{children}</dd>
    </div>
  );
}

/** A04 · Order detail & intervention. */
export default function OrderDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}): ReactNode {
  const { id } = use(params);
  const roles = useSession().data?.roles ?? [];
  const order = useQuery({
    queryKey: [...adminKeys.ordersAll, 'detail', id],
    queryFn: () => findOrderSummary(id, (q) => adminClient.ordering.listAdminOrders(q)),
    refetchInterval: LIVE_REFRESH_MS,
  });
  return (
    <div className="flex flex-col gap-6">
      <Link href="/live" className="text-caption font-semibold text-accent-text">
        ← {t('order.back')}
      </Link>
      <QueryView
        query={order}
        what={t('order.summary')}
        isEmpty={(o) => o === null}
        empty={<EmptyBlock title={t('order.notFound')} body={t('order.notFoundBody')} />}
      >
        {(o) =>
          o === null ? null : (
            <>
              <PageHeader
                title={t('order.title', { ref: o.ref })}
                actions={<OrderStatusBadge status={o.status} />}
              />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card title={t('order.summary')}>
                  <dl className="grid grid-cols-2 gap-4">
                    <Row label={t('order.status')}>
                      <OrderStatusBadge status={o.status} />
                    </Row>
                    <Row label={t('order.vendor')}>{o.vendorName}</Row>
                    <Row label={t('order.customer')}>{o.customerId.slice(0, 8)}</Row>
                    <Row label={t('order.items')}>{o.itemCount}</Row>
                    <Row label={t('order.total')}>{formatMoney(o.total)}</Row>
                    <Row label={t('order.created')}>{formatDateTime(o.createdAt)}</Row>
                  </dl>
                  <div className="mt-4">
                    <Alert tone="info" title={t('common.debtTitle')}>
                      {t('order.timelineDebt')}
                    </Alert>
                  </div>
                </Card>
                <OrderActions
                  order={o}
                  canCancel={canAccess('orderCancel', roles)}
                  canAssign={canAccess('dispatch', roles)}
                />
              </div>
            </>
          )
        }
      </QueryView>
    </div>
  );
}
