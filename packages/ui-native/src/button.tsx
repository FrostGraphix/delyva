import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme } from 'react-native';
import { tokens } from '@delyva/design-tokens';
import { buttonStyleSpec, type ButtonSize, type ButtonVariant } from './button-styles.js';

/** Button props. */
export interface ButtonProps {
  /** Visible label (also the accessibility label unless overridden). */
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
}

/** Design-system button for the Expo apps; colours, sizes and motion come only from tokens. */
export function Button({
  label,
  onPress,
  variant = 'ink',
  size = 'md',
  loading = false,
  disabled = false,
  accessibilityLabel,
}: ButtonProps): ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const s = buttonStyleSpec(variant, size, scheme);
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={s.hitSlop}
      style={({ pressed }) => ({
        backgroundColor: s.backgroundColor,
        height: s.height,
        paddingHorizontal: s.paddingHorizontal,
        borderRadius: s.borderRadius,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: inactive ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color={s.color} />
      ) : (
        <Text
          style={{
            color: s.color,
            fontSize: s.fontSize,
            fontWeight: '600',
            fontFamily: tokens.font.family.body,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
