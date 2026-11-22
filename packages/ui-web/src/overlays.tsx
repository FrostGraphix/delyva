'use client';

import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Modal dialog props. */
export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Modal dialog on the native `<dialog>` element: focus is trapped and restored by the browser,
 * Escape closes it, and the title labels it for screen readers.
 */
export function Dialog({ open, title, onClose, children }: DialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(92vw,32rem)] rounded-2xl border border-line bg-surface p-6 text-text backdrop:bg-ink-900/60"
    >
      <h2 id={titleId} className="mb-4 font-heading text-h2 font-bold">
        {title}
      </h2>
      {open ? children : null}
    </dialog>
  );
}

/** Toast tones. */
export type ToastTone = 'success' | 'danger' | 'info';

interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

/** Toast API. */
export interface ToastApi {
  /** Shows a toast for ~4 s. */
  show(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_TONE: Record<ToastTone, string> = {
  success: 'bg-success text-on-button-ink',
  danger: 'bg-danger text-on-button-ink',
  info: 'bg-button-ink text-on-button-ink',
};

/** Provides {@link useToast}; renders toasts in a polite live region at the bottom. */
export function ToastProvider({
  children,
  durationMs = 4_000,
}: {
  readonly children: ReactNode;
  readonly durationMs?: number;
}): ReactElement {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = ++next.current;
      setItems((xs) => [...xs, { id, message, tone }]);
      setTimeout(() => {
        setItems((xs) => xs.filter((x) => x.id !== id));
      }, durationMs);
    },
    [durationMs],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <p
            key={t.id}
            role="status"
            className={`rounded-pill px-5 py-3 text-body font-semibold shadow-lg ${TOAST_TONE[t.tone]}`}
          >
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns the toast API. @throws when used outside {@link ToastProvider} */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
