import type { ReactElement, ReactNode } from 'react';

/** Empty-state props. */
export interface EmptyStateProps {
  /** Decorative illustration or icon (hidden from screen readers). */
  readonly illustration?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** One action at most (UX rule: illustration + one action). */
  readonly action?: ReactNode;
}

/** Centered empty state. */
export function EmptyState({
  illustration,
  title,
  description,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {illustration !== undefined ? (
        <span aria-hidden="true" className="text-text-muted">
          {illustration}
        </span>
      ) : null}
      <p className="font-heading text-h3 font-bold text-text">{title}</p>
      {description !== undefined ? (
        <p className="max-w-prose text-body text-text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
