import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { AppText } from './app-text.js';

/** PriceRow props. */
export interface PriceRowProps {
  readonly label: string;
  /** Already-formatted amount (server-computed; never computed on device). */
  readonly value: string;
  readonly emphasis?: boolean;
  readonly tone?: 'default' | 'accent';
  readonly testID?: string;
}

/** One line of a price breakdown. */
export function PriceRow({
  label,
  value,
  emphasis = false,
  tone = 'default',
  testID,
}: PriceRowProps): ReactElement {
  const variant = emphasis ? 'h3' : 'body';
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label} ${value}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: tokens.space[1],
      }}
    >
      <AppText variant={variant} tone={emphasis ? 'default' : 'muted'}>
        {label}
      </AppText>
      <AppText variant={variant} tone={tone === 'accent' ? 'accent' : 'default'} numeric>
        {value}
      </AppText>
    </View>
  );
}
