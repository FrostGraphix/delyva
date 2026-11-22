'use client';
import { usePromos } from '@delyva/sdk';
import { Alert, Skeleton, StatCard } from '@delyva/ui-web';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { adminClient } from '@/lib/client/api';
import { errorMessage } from '@/lib/client/errors';
import { useAdminOrders, useOpsRiders, useRiderApps, useVendorApps } from '@/lib/client/queries';
import { useSession } from '@/lib/client/session';
import { startOfLagosDay } from '@/lib/format';
import { t } from '@/lib/i18n';
import { canAccess } from '@/lib/roles';
import { countInProgress, countOrders, countRiders } from './kpis';

function Kpi<T>({
  label,
  query,
  allowed,
  value,
  caption,
}: {
  readonly label: string;
  readonly query: UseQueryResult<T>;
  readonly allowed: boolean;
  readonly value: (data: T) => string;
  readonly caption?: (data: T) => string;
}): ReactNode {
  if (!allowed)
    return <StatCard label={label} value={null} unavailableLabel={t('overview.noAccess')} />;
  if (query.isPending)
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <Skeleton label={t('common.loading', { what: label })} lines={2} />
      </div>
    );
  if (query.data === undefined) {
    return (
      <StatCard
        label={label}
        value={null}
        unavailableLabel={t('common.errorTitle')}
        caption={errorMessage(query.error)}
      />
    );
  }
  return <StatCard label={label} value={value(query.data)} caption={caption?.(query.data)} />;
}

/** A02 · Overview: KPIs computed only from existing admin endpoints; the rest are DEBT tiles. */
export default function OverviewPage(): ReactNode {
  const roles = useSession().data?.roles ?? [];
  const ops = canAccess('dispatch', roles);
  const live = canAccess('live', roles);
  const from = useMemo(() => startOfLagosDay(), []);
  const today = useAdminOrders({ from, limit: 50 }, true);
  const recent = useAdminOrders({ limit: 50 }, true);
  const riders = useOpsRiders(ops);
  const riderApps = useRiderApps('pending_review', ops);
  const vendorApps = useVendorApps('pending_review', ops);
  const promos = usePromos(adminClient);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('overview.title')} subtitle={t('overview.subtitle')} />
      <section aria-label={t('overview.title')} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi
          label={t('overview.ordersToday')}
          query={today}
          allowed={live}
          value={countOrders}
          caption={() => t('overview.ordersTodayCaption')}
        />
        <Kpi
          label={t('overview.inProgress')}
          query={recent}
          allowed={live}
          value={(d) => String(countInProgress(d))}
          caption={() => t('overview.inProgressCaption')}
        />
        <Kpi
          label={t('overview.ridersOnline')}
          query={riders}
          allowed={ops}
          value={(d) => String(countRiders(d).online)}
          caption={(d) => t('overview.ridersOnlineCaption', { onTrip: countRiders(d).onTrip })}
        />
        <Kpi
          label={t('overview.activePromos')}
          query={promos}
          allowed={ops}
          value={(d) => String(d.items.filter((p) => p.active).length)}
        />
        <Kpi
          label={t('overview.pendingRiders')}
          query={riderApps}
          allowed={ops}
          value={(d) => String(d.items.length)}
        />
        <Kpi
          label={t('overview.pendingVendors')}
          query={vendorApps}
          allowed={ops}
          value={(d) => String(d.items.length)}
        />
        {/* DEBT(admin): GMV, delivery time and cancellation rate need a reporting endpoint — no aggregate API exists — add GET /v1/admin/reports/daily. */}
        <StatCard
          label={t('overview.gmv')}
          value={null}
          unavailableLabel={t('common.needsEndpoint')}
          caption={t('overview.debtCaption')}
        />
        <StatCard
          label={t('overview.avgDelivery')}
          value={null}
          unavailableLabel={t('common.needsEndpoint')}
          caption={t('overview.debtCaption')}
        />
      </section>
      <Alert tone="info" title={t('common.debtTitle')}>
        {`${t('overview.cancelRate')}: ${t('overview.debtCaption')}.`}
      </Alert>
    </div>
  );
}
