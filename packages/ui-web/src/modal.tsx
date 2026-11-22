'use client';
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';

/** Modal props. */
export interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  /** Called on Escape or the close button. */
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Footer actions (one primary). */
  readonly footer?: ReactNode;
  /** Label for the close button (i18n). */
  readonly closeLabel: string;
}

/**
 * Accessible modal on the native `<dialog>` element: the browser traps and restores focus,
 * Escape closes it, and the title labels the dialog.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  closeLabel,
}: ModalProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded-xl border border-line bg-surface p-0 text-text backdrop:bg-ink-900/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-heading text-h2 font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 rounded-pill text-h2 text-text-muted focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={closeLabel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {children}
        {footer !== undefined ? <footer className="flex justify-end gap-3">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
