import type { ReactElement, ReactNode } from 'react';

/** Semantic tone of a badge. Colour is never the only signal: the label carries the meaning. */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONE: Record<BadgeTone, string> = {
  neutral: 'border-line text-text-muted',
  success: 'border-success text-success',
  warning: 'border-warning text-text',
  danger: 'border-danger text-danger',
  info: 'border-info text-info',
  brand: 'border-primary text-accent-text',
};

/** Badge props. */
export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}

/** Returns the badge classes for a tone. */
export function badgeToneClassName(tone: BadgeTone): string {
  return TONE[tone];
}

/** Small outlined status pill. */
export function Badge({ tone = 'neutral', children }: BadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-micro font-semibold ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
