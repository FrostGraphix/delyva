import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

/** Visual variants from docs/07 §7 (Glass is intentionally omitted on web content surfaces). */
export type ButtonVariant = 'ink' | 'brand' | 'soft' | 'ghost' | 'danger';
/** Heights 56 / 48 / 36. */
export type ButtonSize = 'lg' | 'md' | 'sm';

/** Button props. */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Shows a busy state and disables the button. */
  readonly loading?: boolean;
  readonly children: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  ink: 'bg-button-ink text-on-button-ink',
  brand: 'bg-primary text-on-primary',
  soft: 'bg-lime-100 text-ink-900',
  ghost: 'bg-transparent text-text',
  danger: 'bg-danger text-on-button-ink',
};

const SIZE: Record<ButtonSize, string> = {
  lg: 'h-14 px-6 text-body-l',
  md: 'h-12 px-5 text-body',
  sm: 'h-9 px-4 text-caption',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-sans font-semibold ' +
  'transition-transform duration-micro ease-standard active:scale-[.98] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none';

/** Returns the token-based class list for a variant and size. */
export function buttonClassName(variant: ButtonVariant = 'ink', size: ButtonSize = 'md'): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}`;
}

/** Design-system button for vendor and admin web, styled only with token classes. */
export function Button({
  variant = 'ink',
  size = 'md',
  loading = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={buttonClassName(variant, size)}
      disabled={disabled === true || loading}
      aria-busy={loading}
      {...rest}
    >
      {children}
    </button>
  );
}
