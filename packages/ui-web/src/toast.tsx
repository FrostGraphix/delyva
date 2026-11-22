import type { ReactElement } from 'react';

/** One toast message. */
export interface ToastItem {
  readonly id: string;
  readonly tone: 'success' | 'danger' | 'info';
  readonly message: string;
}

const TONE: Record<ToastItem['tone'], string> = {
  success: 'border-l-success',
  danger: 'border-l-danger',
  info: 'border-l-info',
};

/** Toast viewport props. */
export interface ToastViewportProps {
  readonly toasts: readonly ToastItem[];
  /** Dismiss handler; receives the toast id. */
  readonly onDismiss: (id: string) => void;
  /** Accessible label for the dismiss button (i18n). */
  readonly dismissLabel: string;
}

/** Bottom-right live region rendering toasts. Presentational only; state lives in the app. */
export function ToastViewport({
  toasts,
  onDismiss,
  dismissLabel,
}: ToastViewportProps): ReactElement {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-6 bottom-6 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'danger' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-l-4 border-line bg-surface p-4 text-body text-text shadow-lg ${TONE[t.tone]}`}
        >
          <span>{t.message}</span>
          <button
            type="button"
            className="min-h-12 min-w-12 text-text-muted"
            aria-label={dismissLabel}
            onClick={() => {
              onDismiss(t.id);
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
