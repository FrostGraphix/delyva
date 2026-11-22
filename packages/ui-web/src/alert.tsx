import type { ReactElement, ReactNode } from 'react';

/** Alert tone. */
export type AlertTone = 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<AlertTone, string> = {
  info: 'border-info',
  warning: 'border-warning',
  danger: 'border-danger',
  success: 'border-success',
};

/** Alert props. */
export interface AlertProps {
  readonly tone?: AlertTone;
  /** Short bold title. */
  readonly title: ReactNode;
  readonly children?: ReactNode;
  /** Optional action (e.g. a retry button). */
  readonly action?: ReactNode;
}

/**
 * Inline banner for offline, error and debt notices. Uses `role="alert"` for danger and
 * `role="status"` otherwise so screen readers announce it with the right urgency.
 */
export function Alert({ tone = 'info', title, children, action }: AlertProps): ReactElement {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-4 rounded-lg border border-l-4 border-line bg-surface p-4 ${TONE[tone]}`}
    >
      <div className="flex flex-col gap-1">
        <strong className="text-body font-semibold text-text">{title}</strong>
        {children !== undefined ? (
          <div className="text-caption text-text-muted">{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}
