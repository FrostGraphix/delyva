import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { usePalette } from './theme.js';

/** Card props. */
export interface CardProps {
  readonly children: ReactNode;
  /** Makes the card a button; then pass `accessibilityLabel`. */
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly padded?: boolean;
  readonly style?: ViewStyle;
  readonly testID?: string;
}

/** Flat content card (solid surface, hairline border); never glass (docs/07 §13). */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  padded = true,
  style,
  testID,
}: CardProps): ReactElement {
  const c = usePalette();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    borderColor: c.line,
    padding: padded ? tokens.space[4] : 0,
    overflow: 'hidden',
    ...style,
  };
  if (!onPress) {
    return (
      <View style={base} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({ ...base, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      {children}
    </Pressable>
  );
}
