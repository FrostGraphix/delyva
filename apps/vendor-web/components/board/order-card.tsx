'use client';

import type { OrderSummary } from '@delyva/contracts';
import { ApiError } from '@delyva/sdk';
import { Badge, Button, SkeletonBlock, useToast } from '@delyva/ui-web';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import {
  autoRejectSeconds,
  type OrderAction,
  placedAt,
  useOrder,
  useOrderAction,
} from '../../lib/client/orders';
import { t, tMaybe } from '../../lib/i18n';
import { formatMoney } from '../../lib/money';
import { formatCountdown, useSecondsLeft } from './countdown';
import { AcceptDialog, RejectDialog } from './order-dialogs';

type Open = 'accept' | 'reject' | null;

function Countdown({ from }: { readonly from: Date | null }): ReactNode {
  const window = autoRejectSeconds();
  const left = useSecondsLeft(from && window ? new Date(from.getTime() + window * 1_000) : null);
  if (left === null) return null;
  return (
    <Badge tone={left < 60 ? 'danger' : 'warning'}>
      {t('alert.autoReject', { time: formatCountdown(left) })}
    </Badge>
  );
}

/** One order on the board with its next actions. */
export function OrderCard({
  summary,
  vendorId,
}: {
  readonly summary: OrderSummary;
  readonly vendorId: string;
}): ReactNode {
  const detail = useOrder(summary.id);
  const action = useOrderAction(vendorId);
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [intent, setIntent] = useState(() => crypto.randomUUID());
  const o = detail.data;
  const isNew = summary.status === 'PLACED';

  // mutateAsync (not mutate's per-call callbacks): the card unmounts when the order moves column,
  // and TanStack Query skips per-call callbacks for an unmounted observer, which dropped the toast.
  function act(a: OrderAction, done: string): void {
    action
      .mutateAsync({ id: summary.id, action: a, key: `${intent}-${a.kind}` })
      .then(() => {
        setOpen(null);
        setIntent(crypto.randomUUID());
        toast.show(done);
      })
      .catch((err: unknown) => {
        toast.show(
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : t('common.error'),
          'danger',
        );
      });
  }

  return (
    <article
      aria-label={t('order.title', { ref: summary.ref })}
      className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 ${isNew ? 'border-2 border-danger' : 'border-line'}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/orders/${summary.id}`}
          className="font-heading text-h3 font-extrabold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          #{summary.ref}
        </Link>
        <Badge tone={isNew ? 'danger' : 'neutral'}>
          {tMaybe(`status.${summary.status}`, 'status.other')}
        </Badge>
      </header>
      {o ? (
        <ul className="text-body">
          {o.items.map((i) => (
            <li key={`${i.itemId}-${i.name}`}>
              {i.quantity}× {i.name}
              {i.options.length > 0 ? (
                <span className="text-text-muted">
                  {' '}
                  · {i.options.map((x) => x.name).join(', ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <SkeletonBlock className="h-10 w-full" />
      )}
      <p className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <span>{t('board.items', { count: summary.itemCount })}</span>
        <span aria-hidden="true">·</span>
        <span>{formatMoney(summary.total)}</span>
        {o?.prepMinutes ? (
          <span>
            · {t('order.prep')}: {t('accept.minutes', { minutes: o.prepMinutes })}
          </span>
        ) : null}
      </p>
      {isNew ? <Countdown from={placedAt(o)} /> : null}
      {o?.pickupCode && summary.status !== 'PLACED' ? (
        <p className="rounded-lg bg-accent-100 px-3 py-2 text-body text-ink-900">
          {t('board.pickupCode')}:{' '}
          <strong className="font-heading text-h3 tracking-widest">{o.pickupCode}</strong>
        </p>
      ) : null}
      <Actions
        status={summary.status}
        busy={action.isPending}
        setOpen={setOpen}
        act={act}
        orderRef={summary.ref}
      />
      <AcceptDialog
        orderRef={summary.ref}
        open={open === 'accept'}
        busy={action.isPending}
        onClose={() => {
          setOpen(null);
        }}
        onConfirm={(m) => {
          act({ kind: 'accept', prepMinutes: m }, t('accept.done', { ref: summary.ref }));
        }}
      />
      <RejectDialog
        orderRef={summary.ref}
        open={open === 'reject'}
        busy={action.isPending}
        onClose={() => {
          setOpen(null);
        }}
        onConfirm={(reason) => {
          act({ kind: 'reject', reason }, t('reject.done', { ref: summary.ref }));
        }}
      />
    </article>
  );
}

function Actions({
  status,
  busy,
  setOpen,
  act,
  orderRef,
}: {
  readonly status: OrderSummary['status'];
  readonly busy: boolean;
  readonly setOpen: (o: Open) => void;
  readonly act: (a: OrderAction, done: string) => void;
  readonly orderRef: string;
}): ReactNode {
  if (status === 'PLACED') {
    return (
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setOpen('reject');
          }}
        >
          {t('board.reject')}
        </Button>
        <Button
          variant="brand"
          size="lg"
          onClick={() => {
            setOpen('accept');
          }}
        >
          {t('board.accept')}
        </Button>
      </div>
    );
  }
  if (status === 'VENDOR_ACCEPTED') {
    return (
      <Button
        variant="ink"
        loading={busy}
        onClick={() => {
          act({ kind: 'preparing' }, t('order.preparingDone', { ref: orderRef }));
        }}
      >
        {t('board.startPreparing')}
      </Button>
    );
  }
  if (status === 'PREPARING') {
    return (
      <Button
        variant="brand"
        loading={busy}
        onClick={() => {
          act({ kind: 'ready' }, t('order.readyDone', { ref: orderRef }));
        }}
      >
        {t('board.markReady')}
      </Button>
    );
  }
  return <p className="text-caption text-text-muted">{t('board.waitingRider')}</p>;
}
