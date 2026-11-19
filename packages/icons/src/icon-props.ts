/** Allowed icon sizes (tokens: 16, 20, 24, 32). */
export type IconSize = 16 | 20 | 24 | 32;

/** Props shared by web and native icons. */
export interface IconProps {
  /** Rendered size in px/dp; defaults to 24. */
  readonly size?: IconSize;
  /** Stroke colour; defaults to `currentColor` (web) or the inherited text colour you pass (native). */
  readonly color?: string;
  /** Accessible label. Omit only for decorative icons next to visible text. */
  readonly accessibilityLabel?: string;
}

/** Default stroke width for the regular weight. */
export const ICON_STROKE = 1.5;
