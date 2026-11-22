import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { usePalette } from './theme.js';

/** Chip props. */
export interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress: () => void;
  readonly icon?: ReactNode;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** Filter/category chip; the selected state is ink-filled and announced (never colour alone). */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  accessibilityLabel,
  testID,
}: ChipProps): ReactElement {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={{
        minHeight: 36,
        paddingHorizontal: tokens.space[4],
        borderRadius: tokens.radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space[2],
        backgroundColor: selected ? c.buttonInk : c.surface,
        borderWidth: 1,
        borderColor: selected ? c.buttonInk : c.line,
      }}
    >
      {icon}
      <Text
        style={{
          color: selected ? c.onButtonInk : c.text,
          fontSize: tokens.type.body.size,
          fontWeight: '600',
          fontFamily: tokens.font.family.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
