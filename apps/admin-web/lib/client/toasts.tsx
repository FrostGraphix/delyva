'use client';
import { ToastViewport, type ToastItem } from '@delyva/ui-web';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { t } from '../i18n';

type Push = (tone: ToastItem['tone'], message: string) => void;

const ToastContext = createContext<Push>(() => undefined);

const TOAST_MS = 5000;

/** Provides `useToast()` and renders the toast viewport. */
export function ToastProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const dismiss = useCallback((id: string) => {
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);
  const push = useCallback<Push>(
    (tone, message) => {
      const id = crypto.randomUUID();
      setToasts((all) => [...all, { id, tone, message }]);
      setTimeout(() => {
        dismiss(id);
      }, TOAST_MS);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} dismissLabel={t('common.dismiss')} />
    </ToastContext.Provider>
  );
}

/** Returns `push(tone, message)`. */
export function useToast(): Push {
  return useContext(ToastContext);
}
