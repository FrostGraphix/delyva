import type { ReactElement, ReactNode } from 'react';

/** Stat card props. */
export interface StatCardProps {
  readonly label: string;
  /** The value; `null` renders the unavailable state instead of a number. */
  readonly value: ReactNode | null;
  /** Secondary line (delta, unit, source). */
  readonly caption?: ReactNode;
  /** Shown when `value` is null (e.g. "Needs reporting endpoint"). */
  readonly unavailableLabel?: string;
}

/** KPI tile. Never shows a fabricated number: a null value renders an explicit unavailable state. */
export function StatCard({
  label,
  value,
  caption,
  unavailableLabel = 'Unavailable',
}: StatCardProps): ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
      <span className="text-caption font-semibold text-text-muted">{label}</span>
      {value === null ? (
        <span className="text-body font-semibold text-text-muted">{unavailableLabel}</span>
      ) : (
        <span className="font-heading text-display font-extrabold text-text">{value}</span>
      )}
      {caption !== undefined ? <span className="text-micro text-text-muted">{caption}</span> : null}
    </div>
  );
}
