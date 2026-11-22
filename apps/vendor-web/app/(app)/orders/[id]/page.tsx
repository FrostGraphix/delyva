'use client';

import { ApiError } from '@delyva/sdk';
import { Badge, EmptyPanel, ErrorState, SkeletonList } from '@delyva/ui-web';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useOrder } from '../../../../lib/client/orders';
import { t, tMaybe } from '../../../../lib/i18n';
import { formatMoney } from '../../../../lib/money';

const TIME = new Intl.DateTimeFormat('en-NG', { timeStyle: 'short', timeZone: 'Africa/Lagos' });

/** Order detail with items, totals, pickup code and the status timeline. */
export default function OrderDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const q = useOrder(id);
  const back = (
    <Link
      href="/orders"
      className="text-body font-semibold text-accent-text underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      ← {t('order.back')}
    </Link>
  );
  if (q.isPending) return <SkeletonList rows={4} label={t('common.loading')} />;
  if (q.isError) {
    const missing = q.error instanceof ApiError && [403, 404].includes(q.error.problem.status);
    return (
      <div className="flex flex-col gap-4">
        {back}
        {missing ? (
          <EmptyPanel title={t('order.notFound')} />
        ) : (
          <ErrorState
            title={t('common.error')}
            action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
          />
        )}
      </div>
    );
  }
  const o = q.data;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {back}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h1 font-extrabold">{t('order.title', { ref: o.ref })}</h1>
        <Badge tone="brand">{tMaybe(`status.${o.status}`, 'status.other')}</Badge>
      </header>
      {o.pickupCode ? (
        <section
          aria-label={t('board.pickupCode')}
          className="rounded-2xl bg-lime-100 p-6 text-center text-ink-900"
        >
          <p className="text-caption font-semibold">{t('board.pickupCode')}</p>
          <p
            data-testid="pickup-code"
            className="font-heading text-display font-extrabold tracking-[0.3em]"
          >
            {o.pickupCode}
          </p>
        </section>
      ) : null}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-heading text-h3 font-bold">{t('order.items')}</h2>
        <ul className="flex flex-col gap-2">
          {o.items.map((i) => (
            <li key={`${i.itemId}-${i.name}`} className="flex justify-between gap-4 text-body">
              <span>
                {i.quantity}× {i.name}
                {i.options.length > 0 ? (
                  <span className="block text-caption text-text-muted">
                    {i.options.map((x) => x.name).join(', ')}
                  </span>
                ) : null}
              </span>
              <span>{formatMoney(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-1 border-t border-line pt-3 text-body">
          <dt>{t('order.subtotal')}</dt>
          <dd className="text-right">{formatMoney(o.totals.itemsSubtotal)}</dd>
          <dt className="font-semibold">{t('order.total')}</dt>
          <dd className="text-right font-semibold">{formatMoney(o.totals.total)}</dd>
          {o.prepMinutes ? (
            <>
              <dt>{t('order.prep')}</dt>
              <dd className="text-right">{t('accept.minutes', { minutes: o.prepMinutes })}</dd>
            </>
          ) : null}
        </dl>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-heading text-h3 font-bold">{t('order.timeline')}</h2>
        <ol className="flex flex-col gap-2">
          {o.timeline.map((e) => (
            <li key={`${e.status}-${e.at}`} className="flex justify-between gap-4 text-body">
              <span>
                {tMaybe(`status.${e.status}`, 'status.other')}
                {e.reason ? (
                  <span className="block text-caption text-text-muted">{e.reason}</span>
                ) : null}
              </span>
              <time dateTime={e.at} className="text-text-muted">
                {TIME.format(new Date(e.at))}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
