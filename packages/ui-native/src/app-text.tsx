import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text, type TextProps, type TextStyle } from 'react-native';
import { type Palette, usePalette } from './theme.js';

/** Type-scale variant from design tokens. */
export type TextVariant = keyof typeof tokens.type;
/** Semantic text tone. */
export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'onPrimary' | 'inverse';

/** AppText props. */
export interface AppTextProps extends Omit<TextProps, 'style'> {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  readonly align?: TextStyle['textAlign'];
  /** Tabular numerals for prices and timers. */
  readonly numeric?: boolean;
  readonly style?: TextStyle;
  readonly children?: ReactNode;
}

const HEADINGS: ReadonlySet<TextVariant> = new Set<TextVariant>(['display', 'h1', 'h2', 'h3']);

/** Token font family; on web add generic fallbacks so unloaded brand fonts never fall back to serif. */
function family(heading: boolean): string {
  const f = heading ? tokens.font.family.heading : tokens.font.family.body;
  return Platform.OS === 'web' ? `"${f}", Inter, system-ui, sans-serif` : f;
}

function toneColor(tone: TextTone, c: Palette): string {
  const map: Record<TextTone, string> = {
    default: c.text,
    muted: c.textMuted,
    accent: c.accentText,
    danger: c.danger,
    onPrimary: c.onPrimary,
    inverse: c.onButtonInk,
  };
  return map[tone];
}

/** Token-typed text. Scales with the OS font-size setting (font scaling is never disabled). */
export function AppText({
  variant = 'body',
  tone = 'default',
  align,
  numeric = false,
  style,
  children,
  ...rest
}: AppTextProps): ReactElement {
  const c = usePalette();
  const t = tokens.type[variant];
  const heading = HEADINGS.has(variant);
  return (
    <Text
      {...rest}
      accessibilityRole={rest.accessibilityRole ?? (heading ? 'header' : 'text')}
      style={{
        color: toneColor(tone, c),
        fontSize: t.size,
        lineHeight: t.line,
        fontWeight: String(t.weight) as TextStyle['fontWeight'],
        fontFamily: family(heading),
        textAlign: align,
        fontVariant: numeric ? ['tabular-nums'] : undefined,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}
