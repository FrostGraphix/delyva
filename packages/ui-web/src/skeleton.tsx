import type { ReactElement } from 'react';

/** Skeleton props. */
export interface SkeletonProps {
  /** Number of stacked bars. */
  readonly lines?: number;
  /** Accessible label announced while loading. */
  readonly label: string;
}

/** Loading placeholder (skeletons, not spinners). Pulses unless the OS asks for reduced motion. */
export function Skeleton({ lines = 3, label }: SkeletonProps): ReactElement {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="block h-4 animate-pulse rounded-md bg-line motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
