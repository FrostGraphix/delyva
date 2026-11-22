import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from './use-theme-colors.js';

/** One option of a {@link ChoiceGroup}. */
export interface Choice {
  readonly value: string;
  readonly label: string;
}

/** Choice group props. */
export interface ChoiceGroupProps {
  /** Group label read by screen readers. */
  readonly label: string;
  readonly options: readonly Choice[];
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly testID?: string;
}

/**
 * Single-choice list of 56 px radio rows. Selection is shown by a filled marker, bold text and
 * border colour together (never colour alone).
 */
export function ChoiceGroup(p: ChoiceGroupProps): ReactElement {
  const c = useThemeColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={p.label}
      style={{ gap: tokens.space[2] }}
    >
      {p.options.map((o) => {
        const on = o.value === p.value;
        return (
          <Pressable
            key={o.value}
            testID={p.testID ? `${p.testID}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
            onPress={() => {
              p.onChange(o.value);
            }}
            style={{
              minHeight: tokens.space[14],
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.space[3],
              paddingHorizontal: tokens.space[4],
              borderRadius: tokens.radius.md,
              borderWidth: on ? 2 : 1,
              borderColor: on ? c.primary : c.line,
              backgroundColor: c.surface,
            }}
          >
            <View
              style={{
                width: tokens.space[5],
                height: tokens.space[5],
                borderRadius: tokens.radius.pill,
                borderWidth: 2,
                borderColor: on ? c.accentText : c.textMuted,
                backgroundColor: on ? c.accentText : 'transparent',
              }}
            />
            <Text
              style={{
                color: c.text,
                fontSize: tokens.type.bodyL.size,
                fontWeight: on ? '700' : '400',
                flex: 1,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
