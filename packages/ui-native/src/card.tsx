import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { useThemeColors } from './use-theme-colors.js';

/** Card props. */
export interface CardProps {
  readonly children: ReactNode;
  /** Optional test id for end-to-end tests. */
  readonly testID?: string;
  /** Lay children out in a row. */
  readonly row?: boolean;
}

/** Surface card on the token palette (radius xl, 16 px padding, 1 px line). */
export function Card({ children, testID, row = false }: CardProps): ReactElement {
  const c = useThemeColors();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: tokens.radius.xl,
        padding: tokens.space[4],
        gap: tokens.space[3],
        flexDirection: row ? 'row' : 'column',
        alignItems: row ? 'center' : 'stretch',
      }}
    >
      {children}
    </View>
  );
}
