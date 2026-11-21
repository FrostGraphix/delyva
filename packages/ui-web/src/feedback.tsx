import type { ReactElement, ReactNode } from 'react';
import { Button } from './button.js';

/** Skeleton block props. */
export interface SkeletonProps {
  /** Token-based size classes, e.g. `h-6 w-40`. */
  readonly className?: string;
}

/** Loading placeholder (skeletons, not spinners). Hidden from assistive tech. */
export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-line motion-reduce:animate-none ${className}`}
    />
  );
}

/** A list of skeleton rows with a polite "loading" announcement. */
export function SkeletonList({
  rows = 3,
  label,
}: {
  readonly rows?: number;
  readonly label: string;
}): ReactElement {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** Empty/error panel props. */
export interface StatePanelProps {
  readonly title: string;
  readonly message?: string;
  /** Optional decorative illustration or icon. */
  readonly icon?: ReactNode;
  /** One primary action. */
  readonly action?: { readonly label: string; readonly onClick: () => void };
}

function Panel({
  title,
  message,
  icon,
  action,
  role,
}: StatePanelProps & { readonly role?: 'alert' }): ReactElement {
  return (
    <div
      role={role}
      className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center"
    >
      {icon ? <span className="text-text-muted">{icon}</span> : null}
      <p className="font-heading text-h3 font-bold">{title}</p>
      {message ? <p className="text-body text-text-muted">{message}</p> : null}
      {action ? (
        <Button variant="ink" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/** Empty state: illustration + one action. */
export function EmptyState(props: StatePanelProps): ReactElement {
  return <Panel {...props} />;
}

/** Error state: plain-language message + retry; announced to screen readers. */
export function ErrorState(props: StatePanelProps): ReactElement {
  return <Panel {...props} role="alert" />;
}

/** Offline banner props. */
export interface OfflineBannerProps {
  readonly visible: boolean;
  readonly message: string;
  readonly icon?: ReactNode;
}

/** Sticky offline banner (renders nothing while online). */
export function OfflineBanner({ visible, message, icon }: OfflineBannerProps): ReactElement | null {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-caption font-semibold text-ink-900"
    >
      {icon}
      {message}
    </div>
  );
}

/** Status badge tones. */
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-line text-text',
  brand: 'bg-primary text-on-primary',
  success: 'bg-success text-on-button-ink',
  warning: 'bg-warning text-ink-900',
  danger: 'bg-danger text-on-button-ink',
  info: 'bg-info text-on-button-ink',
};

/** Small pill label. Pair colour with text so state never relies on colour alone. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-3 py-1 text-micro font-bold ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
