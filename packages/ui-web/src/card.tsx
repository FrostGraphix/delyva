import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

/** Card props. */
export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'title'> {
  /** Optional heading rendered as an `h2`. */
  readonly title?: ReactNode;
  /** Optional element shown at the right of the heading row (actions, badges). */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** Surface container: surface background, hairline border, 20 px radius. */
export function Card({ title, actions, children, ...rest }: CardProps): ReactElement {
  return (
    <section className="rounded-xl border border-line bg-surface p-5" {...rest}>
      {title !== undefined || actions !== undefined ? (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title !== undefined ? (
            <h2 className="font-heading text-h3 font-bold text-text">{title}</h2>
          ) : (
            <span />
          )}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}
