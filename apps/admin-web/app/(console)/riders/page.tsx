'use client';
import type { AdminRiderApplication } from '@delyva/contracts';
import { Badge, Card } from '@delyva/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { ReviewButton } from '@/components/applications/review-button';
import { ReviewPanel } from '@/components/applications/review-panel';
import { StatusFilter, type ReviewStatus } from '@/components/applications/status-filter';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { useRiderApps } from '@/lib/client/queries';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';

const col = columnsFor<AdminRiderApplication>();
const nameOf = (a: AdminRiderApplication): string => a.fullName ?? t('apps.unnamed');

function riderColumns(onReview: (id: string) => void): Columns<AdminRiderApplication> {
  return col.columns([
    col.accessor('fullName', {
      header: () => t('riders.col.name'),
      cell: (c) => nameOf(c.row.original),
    }),
    col.accessor('vehicleType', {
      header: () => t('riders.col.vehicle'),
      cell: (c) => c.getValue() ?? t('common.none'),
    }),
    col.accessor('kycStatus', {
      header: () => t('riders.col.kyc'),
      cell: (c) => (
        <Badge tone={c.getValue() === 'verified' ? 'success' : 'warning'}>
          {t(`riders.kyc.${c.getValue()}`)}
        </Badge>
      ),
    }),
    col.accessor('quizScorePercent', {
      header: () => t('riders.col.quiz'),
      cell: (c) => (c.getValue() === null ? t('common.none') : `${String(c.getValue())}%`),
    }),
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
  ]) as Columns<AdminRiderApplication>;
}

function facts(a: AdminRiderApplication): { label: string; value: ReactNode }[] {
  return [
    {
      label: t('apps.status'),
      value: t(`apps.status.${a.status === 'not_started' ? 'in_progress' : a.status}`),
    },
    { label: t('riders.col.vehicle'), value: a.vehicleType ?? t('common.none') },
    { label: t('riders.col.kyc'), value: t(`riders.kyc.${a.kycStatus}`) },
    {
      label: t('riders.col.quiz'),
      value: a.quizScorePercent === null ? t('common.none') : `${String(a.quizScorePercent)}%`,
    },
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

/** A07 · Riders & applications: queue with KYC, quiz and bank checks; approve/reject. */
export default function RidersPage(): ReactNode {
  const [status, setStatus] = useState<ReviewStatus>('pending_review');
  const [selected, setSelected] = useState<string | null>(null);
  const apps = useRiderApps(status);
  const columns = useMemo(() => riderColumns(setSelected), []);
  const current = apps.data?.items.find((a) => a.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('riders.title')} subtitle={t('riders.subtitle')} />
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
            what={t('riders.title')}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyBlock title={t('riders.empty')} body={t('riders.emptyBody')} />}
          >
            {(d) => (
              <DataTable
                caption={t('riders.title')}
                columns={columns}
                data={d.items}
                rowId={(a) => a.id}
              />
            )}
          </QueryView>
        </Card>
        {current ? (
          <ReviewPanel
            kind="rider"
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
