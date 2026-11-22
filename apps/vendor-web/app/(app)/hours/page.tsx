'use client';

import type { Branch, OpeningHoursEntry } from '@delyva/contracts';
import { ApiError } from '@delyva/sdk';
import { Badge, Button, ErrorState, SkeletonList, Switch, useToast } from '@delyva/ui-web';
import { type ReactNode, useState } from 'react';
import { browserClient } from '../../../lib/client/api';
import { useCatalogWrite, useVendorDetail } from '../../../lib/client/catalog';
import { useCurrentVendor } from '../../../lib/client/providers';
import { DEFAULT_INTERVAL, fromWeek, type Interval, toWeek, type Week } from '../../../lib/hours';
import { type MessageKey, t } from '../../../lib/i18n';

/** Opening hours editor per branch (Lagos time). */
export default function HoursPage(): ReactNode {
  const vendor = useCurrentVendor();
  const q = useVendorDetail(vendor.id);
  const [branchId, setBranchId] = useState<string | null>(null);
  if (q.isPending) return <SkeletonList rows={7} label={t('common.loading')} />;
  if (q.isError) {
    return (
      <ErrorState
        title={t('common.error')}
        action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
      />
    );
  }
  const branch = q.data.branches.find((b) => b.id === branchId) ?? q.data.branches[0];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-heading text-h1 font-extrabold">{t('hours.title')}</h1>
      {q.data.branches.length > 1 ? (
        <label className="flex flex-col gap-1 text-caption font-semibold">
          {t('hours.branch')}
          <select
            value={branch?.id}
            onChange={(e) => {
              setBranchId(e.target.value);
            }}
            className="h-12 rounded-lg border border-line bg-surface px-3 text-body text-text"
          >
            {q.data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {branch ? (
        <HoursEditor
          key={`${branch.id}-${JSON.stringify(branch.openingHours)}`}
          vendorId={vendor.id}
          branch={branch}
        />
      ) : null}
    </div>
  );
}

function HoursEditor({
  vendorId,
  branch,
}: {
  readonly vendorId: string;
  readonly branch: Branch;
}): ReactNode {
  const [week, setWeek] = useState<Week>(() => toWeek(branch.openingHours));
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useCatalogWrite(
    vendorId,
    (hours: { hours: OpeningHoursEntry[] }, key) =>
      browserClient().replaceOpeningHours(vendorId, branch.id, { hours: hours.hours }, key),
  );
  const setDay = (d: number, intervals: readonly Interval[]): void => {
    setWeek((w) => w.map((x, i) => (i === d ? intervals : x)));
    setError(null);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const hours = fromWeek(week);
        if (!hours) {
          setError(t('hours.invalid'));
          return;
        }
        save.mutate(
          { hours, key: crypto.randomUUID() },
          {
            onSuccess: () => {
              toast.show(t('hours.saved'));
            },
            onError: (err) => {
              setError(
                err instanceof ApiError
                  ? (err.problem.detail ?? err.problem.title)
                  : t('common.error'),
              );
            },
          },
        );
      }}
    >
      <Badge tone={branch.isOpenNow ? 'success' : 'neutral'}>
        {branch.isOpenNow ? t('hours.openNow') : t('hours.closedNow')}
      </Badge>
      {week.map((intervals, d) => {
        const day = t(`hours.day.${String(d)}` as MessageKey);
        const first = intervals[0];
        return (
          <fieldset
            key={day}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3"
          >
            <legend className="sr-only">{day}</legend>
            <span className="w-28 text-body font-semibold" aria-hidden="true">
              {day}
            </span>
            <Switch
              checked={first !== undefined}
              label={`${day} ${t('hours.open')}`}
              onChange={(open) => {
                setDay(d, open ? [DEFAULT_INTERVAL] : []);
              }}
            />
            {first ? (
              <>
                <TimeInput
                  label={`${day} ${t('hours.opens')}`}
                  value={first.opensAt}
                  onChange={(v) => {
                    setDay(d, [{ ...first, opensAt: v }, ...intervals.slice(1)]);
                  }}
                />
                <span aria-hidden="true">–</span>
                <TimeInput
                  label={`${day} ${t('hours.closes')}`}
                  value={first.closesAt === '24:00' ? '23:59' : first.closesAt}
                  onChange={(v) => {
                    setDay(d, [{ ...first, closesAt: v }, ...intervals.slice(1)]);
                  }}
                />
                {intervals.length > 1 ? (
                  <span className="text-caption text-text-muted">+{intervals.length - 1}</span>
                ) : null}
              </>
            ) : (
              <span className="text-body text-text-muted">{t('hours.closed')}</span>
            )}
          </fieldset>
        );
      })}
      {error ? (
        <p role="alert" className="text-body font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className="sticky bottom-20 md:bottom-4">
        <Button type="submit" variant="brand" size="lg" loading={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
}): ReactNode {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      step={60}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className="h-12 rounded-lg border border-line bg-bg px-3 text-body text-text"
    />
  );
}
