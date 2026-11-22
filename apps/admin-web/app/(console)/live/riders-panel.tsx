'use client';
import type { AdminDispatchRider } from '@delyva/contracts';
import { Badge, Card } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { RidersMap } from '@/components/riders-map';
import { useOpsRiders } from '@/lib/client/queries';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';

const col = columnsFor<AdminDispatchRider>();

const RIDER_COLUMNS = col.columns([
  col.accessor('riderId', {
    header: () => t('live.col.rider'),
    cell: (c) => c.getValue().slice(0, 8),
  }),
  col.accessor('status', {
    header: () => t('live.col.riderStatus'),
    cell: (c) => (
      <Badge tone={c.getValue() === 'on_trip' ? 'info' : 'success'}>
        {t(`rider.status.${c.getValue()}`)}
      </Badge>
    ),
  }),
  col.accessor('batteryPct', {
    header: () => t('live.col.battery'),
    cell: (c) => {
      const v = c.getValue();
      return v === null ? t('common.none') : `${String(v)}%`;
    },
  }),
  col.accessor('position', {
    header: () => t('live.col.lastSeen'),
    cell: (c) => {
      const p = c.getValue();
      return p ? formatDateTime(p.ts) : t('common.none');
    },
  }),
]) as Columns<AdminDispatchRider>;

/** Online riders on a schematic map plus a table. */
export function RidersPanel(): ReactNode {
  const riders = useOpsRiders();
  return (
    <Card title={t('live.riders')}>
      <QueryView
        query={riders}
        what={t('live.riders')}
        isEmpty={(d) => d.items.length === 0}
        empty={<EmptyBlock title={t('live.ridersEmpty')} body={t('live.ridersEmptyBody')} />}
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <RidersMap riders={d.items} />
            <DataTable
              caption={t('live.riders')}
              columns={RIDER_COLUMNS}
              data={d.items}
              rowId={(r) => r.riderId}
            />
          </div>
        )}
      </QueryView>
    </Card>
  );
}
