'use client';

import type { OrderSummary } from '@delyva/contracts';
import { ReceiptIcon } from '@delyva/icons/web';
import { Badge, EmptyPanel, ErrorState, SkeletonList } from '@delyva/ui-web';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo } from 'react';
import { NewOrderAlert } from '../../../components/board/new-order-alert';
import { OrderCard } from '../../../components/board/order-card';
import {
  type BoardColumn,
  FALLBACK_POLL_MS,
  orderKeys,
  useBoard,
} from '../../../lib/client/orders';
import { useCurrentVendor } from '../../../lib/client/providers';
import { useOrderRealtime } from '../../../lib/client/realtime';
import { type MessageKey, t } from '../../../lib/i18n';

const COLUMNS: readonly { id: BoardColumn; label: MessageKey }[] = [
  { id: 'new', label: 'board.new' },
  { id: 'preparing', label: 'board.preparing' },
  { id: 'ready', label: 'board.ready' },
];

/** Live orders board (M09): New / Preparing / Ready, realtime with polling fallback. */
export default function OrdersBoardPage(): ReactNode {
  const vendor = useCurrentVendor();
  const qc = useQueryClient();
  const onStatus = useCallback(
    (p: { orderId: string }) => {
      void qc.invalidateQueries({ queryKey: orderKeys.board(vendor.id) });
      void qc.invalidateQueries({ queryKey: orderKeys.order(p.orderId) });
    },
    [qc, vendor.id],
  );
  const firstIds = useBoardIds(vendor.id);
  const live = useOrderRealtime(firstIds, onStatus);
  const board = useBoard(vendor.id, live);
  const all = [...board.columns.new, ...board.columns.preparing, ...board.columns.ready];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h1 font-extrabold">{t('board.title')}</h1>
        <Badge tone={live ? 'success' : 'warning'}>
          {live ? t('shell.live') : t('shell.polling', { seconds: FALLBACK_POLL_MS / 1_000 })}
        </Badge>
      </header>
      <NewOrderAlert waitingIds={board.columns.new.map((o) => o.id)} />
      {board.isPending ? (
        <SkeletonList rows={3} label={t('board.loading')} />
      ) : board.isError && all.length === 0 ? (
        <ErrorState
          title={t('board.loadError')}
          action={{ label: t('common.retry'), onClick: board.refetch }}
        />
      ) : all.length === 0 ? (
        <EmptyPanel
          title={t('board.empty')}
          message={t('board.emptyHint')}
          icon={<ReceiptIcon size={32} />}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((c) => (
            <Column
              key={c.id}
              label={t(c.label)}
              orders={board.columns[c.id]}
              vendorId={vendor.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Ids currently on the board (from the query cache) for joining socket rooms. */
function useBoardIds(vendorId: string): string[] {
  const qc = useQueryClient();
  const lists = qc.getQueriesData<{ items: OrderSummary[] }>({
    queryKey: orderKeys.board(vendorId),
  });
  const ids = lists.flatMap(([, d]) => d?.items.map((o) => o.id) ?? []);
  const key = [...new Set(ids)].sort().join(',');
  return useMemo(() => key.split(',').filter(Boolean), [key]);
}

function Column({
  label,
  orders,
  vendorId,
}: {
  readonly label: string;
  readonly orders: readonly OrderSummary[];
  readonly vendorId: string;
}): ReactNode {
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-2xl bg-line/40 p-3">
      <h2 className="flex items-center justify-between font-heading text-h3 font-bold">
        {label} <Badge>{orders.length}</Badge>
      </h2>
      {orders.length === 0 ? (
        <p className="p-4 text-caption text-text-muted">{t('board.emptyColumn')}</p>
      ) : (
        orders.map((o) => <OrderCard key={o.id} summary={o} vendorId={vendorId} />)
      )}
    </section>
  );
}
