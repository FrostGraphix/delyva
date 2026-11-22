import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './app-text.js';
import { usePalette } from './theme.js';

/** QuantityStepper props. */
export interface QuantityStepperProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly min?: number;
  readonly max: number;
  readonly decrementLabel: string;
  readonly incrementLabel: string;
  readonly decrementIcon: ReactNode;
  readonly incrementIcon: ReactNode;
  readonly testID?: string;
}

/** −/+ quantity control with 48 dp targets and announced value. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  decrementLabel,
  incrementLabel,
  decrementIcon,
  incrementIcon,
  testID,
}: QuantityStepperProps): ReactElement {
  const c = usePalette();
  const btn = (label: string, icon: ReactNode, next: number, disabled: boolean): ReactElement => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        onChange(next);
      }}
      style={{
        width: tokens.touchTarget,
        height: tokens.touchTarget,
        borderRadius: tokens.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon}
    </Pressable>
  );
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      {btn(decrementLabel, decrementIcon, value - 1, value <= min)}
      <AppText variant="h3" numeric accessibilityLiveRegion="polite" style={{ minWidth: 24 }}>
        {String(value)}
      </AppText>
      {btn(incrementLabel, incrementIcon, value + 1, value >= max)}
    </View>
  );
}
