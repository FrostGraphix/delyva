'use client';
import type { AdminVendorApplication } from '@delyva/contracts';
import { Card } from '@delyva/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { ReviewButton } from '@/components/applications/review-button';
import { ReviewPanel } from '@/components/applications/review-panel';
import { StatusFilter, type ReviewStatus } from '@/components/applications/status-filter';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { useVendorApps } from '@/lib/client/queries';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';

const col = columnsFor<AdminVendorApplication>();
const nameOf = (a: AdminVendorApplication): string => a.businessName ?? t('apps.unnamed');

function vendorColumns(onReview: (id: string) => void): Columns<AdminVendorApplication> {
  return col.columns([
    col.accessor('businessName', {
      header: () => t('merchants.col.name'),
      cell: (c) => nameOf(c.row.original),
    }),
    col.accessor('cacNumber', {
      header: () => t('merchants.col.cac'),
      cell: (c) => c.getValue() ?? t('common.none'),
    }),
    col.accessor('menuItems', { header: () => t('merchants.col.menu') }),
    col.accessor('submittedAt', {
      header: () => t('apps.submitted'),
      cell: (c) => {
        const v = c.getValue();
        return v ? formatDateTime(v) : t('common.none');
      },
    }),
    col.display({
      id: 'review',
      header: () => t('apps.review'),
      cell: (c) => (
        <ReviewButton
          name={nameOf(c.row.original)}
          onClick={() => {
            onReview(c.row.original.id);
          }}
        />
      ),
    }),
  ]) as Columns<AdminVendorApplication>;
}

function facts(a: AdminVendorApplication): { label: string; value: ReactNode }[] {
  return [
    {
      label: t('apps.status'),
      value: t(`apps.status.${a.status === 'not_started' ? 'in_progress' : a.status}`),
    },
    { label: t('merchants.col.cac'), value: a.cacNumber ?? t('common.none') },
    { label: t('merchants.col.menu'), value: a.menuItems },
    {
      label: t('apps.bankMatch'),
      value:
        a.bankNameMatch === null
          ? t('common.none')
          : t(a.bankNameMatch ? 'common.yes' : 'common.no'),
    },
    { label: t('apps.rejectionReason'), value: a.rejectionReason ?? t('common.none') },
  ];
}

/** A05/A06 · Merchants pipeline and review. */
export default function MerchantsPage(): ReactNode {
  const [status, setStatus] = useState<ReviewStatus>('pending_review');
  const [selected, setSelected] = useState<string | null>(null);
  const apps = useVendorApps(status);
  const columns = useMemo(() => vendorColumns(setSelected), []);
  const current = apps.data?.items.find((a) => a.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('merchants.title')} subtitle={t('merchants.subtitle')} />
      <StatusFilter
        value={status}
        onChange={(s) => {
          setStatus(s);
          setSelected(null);
        }}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <QueryView
            query={apps}
            what={t('merchants.title')}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyBlock title={t('merchants.empty')} body={t('merchants.emptyBody')} />}
          >
            {(d) => (
              <DataTable
                caption={t('merchants.title')}
                columns={columns}
                data={d.items}
                rowId={(a) => a.id}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <ReviewPanel
            kind="vendor"
            id={current.id}
            name={nameOf(current)}
            reviewable={current.status === 'pending_review'}
            facts={facts(current)}
            documentIds={current.documentUploadIds}
            onDone={() => {
              setSelected(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
