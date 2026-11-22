import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './app-text.js';
import { usePalette } from './theme.js';

/** ChoiceRow props. */
export interface ChoiceRowProps {
  readonly label: string;
  /** Right-hand detail such as "+₦500". */
  readonly detail?: string;
  readonly selected: boolean;
  /** `radio` for single choice, `checkbox` for multi. */
  readonly kind: 'radio' | 'checkbox';
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** Radio/checkbox row (lime control, ink tick) on a soft flat card. */
export function ChoiceRow({
  label,
  detail,
  selected,
  kind,
  disabled = false,
  onPress,
  testID,
}: ChoiceRowProps): ReactElement {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: tokens.touchTarget + 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space[3],
        paddingHorizontal: tokens.space[4],
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.line,
        backgroundColor: c.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: kind === 'radio' ? tokens.radius.pill : tokens.radius.sm,
          borderWidth: 2,
          borderColor: selected ? c.primary : c.textMuted,
          backgroundColor: selected ? c.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: tokens.radius.pill,
              backgroundColor: c.onPrimary,
            }}
          />
        ) : null}
      </View>
      <AppText style={{ flex: 1, fontWeight: '600' }}>{label}</AppText>
      {detail ? (
        <AppText variant="caption" tone="muted" numeric>
          {detail}
        </AppText>
      ) : null}
    </Pressable>
  );
}
