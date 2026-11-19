import { type ColorScheme, themeColors, tokens } from '@delyva/design-tokens';

/** Visual variants from docs/07 §7. */
export type ButtonVariant = 'ink' | 'brand' | 'soft' | 'ghost' | 'danger';
/** Heights 56 / 48 / 36 (48 minimum touch target is enforced via hitSlop for `sm`). */
export type ButtonSize = 'lg' | 'md' | 'sm';

/** Resolved, platform-neutral style values for a button. */
export interface ButtonStyleSpec {
  readonly backgroundColor: string;
  readonly color: string;
  readonly height: number;
  readonly paddingHorizontal: number;
  readonly borderRadius: number;
  readonly fontSize: number;
  readonly hitSlop: number;
}

const HEIGHT: Record<ButtonSize, number> = { lg: 56, md: 48, sm: 36 };

/** Computes token-based button styles for a scheme; pure, so it is unit-testable without RN. */
export function buttonStyleSpec(
  variant: ButtonVariant,
  size: ButtonSize,
  scheme: ColorScheme,
): ButtonStyleSpec {
  const c = themeColors(scheme);
  const palette: Record<ButtonVariant, { bg: string; fg: string }> = {
    ink: { bg: c.buttonInk, fg: c.onButtonInk },
    brand: { bg: c.primary, fg: c.onPrimary },
    soft: { bg: tokens.color.lime[100], fg: tokens.color.ink[900] },
    ghost: { bg: 'transparent', fg: c.text },
    danger: { bg: c.danger, fg: c.onButtonInk },
  };
  const height = HEIGHT[size];
  return {
    backgroundColor: palette[variant].bg,
    color: palette[variant].fg,
    height,
    paddingHorizontal: size === 'sm' ? tokens.space[4] : tokens.space[6],
    borderRadius: tokens.radius.pill,
    fontSize: size === 'lg' ? tokens.type.bodyL.size : tokens.type.body.size,
    hitSlop: Math.max(0, (tokens.touchTarget - height) / 2),
  };
}
