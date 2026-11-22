import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { useThemeColors } from './use-theme-colors.js';

/** Typography variants mapped to the type tokens. */
export type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'bodyL' | 'body' | 'caption';
/** Semantic text tones. */
export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'inverse';

/** Typography props. */
export interface TypographyProps {
  readonly children: ReactNode;
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  /** Marks the text as a screen header for screen readers. */
  readonly header?: boolean;
  readonly testID?: string;
  readonly center?: boolean;
  readonly accessibilityLabel?: string;
}

const WEIGHT = { 400: '400', 500: '500', 600: '600', 700: '700', 800: '800' } as const;

/** Token-driven text; scales with the OS font-size setting (allowFontScaling stays on). */
export function Typography({
  children,
  variant = 'body',
  tone = 'default',
  header = false,
  testID,
  center = false,
  accessibilityLabel,
}: TypographyProps): ReactElement {
  const c = useThemeColors();
  const t = tokens.type[variant];
  const color = {
    default: c.text,
    muted: c.textMuted,
    accent: c.accentText,
    danger: c.danger,
    inverse: c.onButtonInk,
  }[tone];
  const heading = variant === 'display' || variant.startsWith('h');
  return (
    <Text
      testID={testID}
      accessibilityRole={header ? 'header' : 'text'}
      accessibilityLabel={accessibilityLabel}
      style={{
        color,
        fontSize: t.size,
        lineHeight: t.line,
        fontWeight: WEIGHT[t.weight],
        fontFamily: heading ? tokens.font.family.heading : tokens.font.family.body,
        textAlign: center ? 'center' : 'auto',
      }}
    >
      {children}
    </Text>
  );
}
