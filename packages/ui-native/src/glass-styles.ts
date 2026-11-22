import { type ColorScheme, themeColors, tokens } from '@delyva/design-tokens';

/** Adds an alpha channel (0–1) to a `#RRGGBB` token colour, returning `#RRGGBBAA`. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`withAlpha: expected #RRGGBB, got ${hex}`);
  const clamped = Math.min(1, Math.max(0, alpha));
  const a = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a.toUpperCase()}`;
}

/** Resolved style for the floating "liquid glass" control layer (docs/07 §5, §13). */
export interface GlassStyleSpec {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly borderWidth: number;
  readonly shadowColor: string;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
  /** CSS backdrop filter; applied on web only (native uses the translucent fill). */
  readonly backdropFilter: string;
}

/**
 * Glass for floating controls only (tab bar, sheets, map overlays), never for content.
 * `solid` is the reduced-transparency / low-end fallback.
 */
export function glassStyleSpec(scheme: ColorScheme, solid = false): GlassStyleSpec {
  const c = themeColors(scheme);
  return {
    backgroundColor: solid ? c.surface : withAlpha(c.surface, scheme === 'dark' ? 0.72 : 0.62),
    borderColor: withAlpha(scheme === 'dark' ? c.line : tokens.color.neutral[0], 0.6),
    borderWidth: 1,
    shadowColor: tokens.color.lime[700],
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 6,
    backdropFilter: 'blur(26px) saturate(1.9) brightness(1.04)',
  };
}
