import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { glassStyleSpec } from './glass-styles.js';
import { usePalette, useScheme } from './theme.js';

/** IconButton props. */
export interface IconButtonProps {
  readonly icon: ReactNode;
  /** Required: icon-only buttons must always be labelled. */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  /** `glass` only over maps/photos; `flat` on content. */
  readonly variant?: 'flat' | 'glass' | 'ink';
  /** Small badge count (e.g. cart items, unread). */
  readonly badge?: number;
  readonly testID?: string;
}

/** 48 dp icon-only button. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'flat',
  badge,
  testID,
}: IconButtonProps): ReactElement {
  const c = usePalette();
  const g = glassStyleSpec(useScheme());
  const bg = { flat: c.surface, glass: g.backgroundColor, ink: c.buttonInk }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        width: tokens.touchTarget,
        height: tokens.touchTarget,
        borderRadius: tokens.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        borderWidth: variant === 'ink' ? 0 : 1,
        borderColor: variant === 'glass' ? g.borderColor : c.line,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {icon}
      {badge !== undefined && badge > 0 ? (
        <View
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: tokens.radius.pill,
            backgroundColor: c.primary,
            borderWidth: 2,
            borderColor: c.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}
