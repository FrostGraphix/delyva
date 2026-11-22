import type { ReactNode } from 'react';

/** Page title block (one `h1` per page). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
}): ReactNode {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-h1 font-extrabold text-text">{title}</h1>
        {subtitle ? <p className="text-body text-text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}
