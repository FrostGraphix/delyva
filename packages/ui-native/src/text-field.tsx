import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useThemeColors } from './use-theme-colors.js';

/** Text field props. */
export interface TextFieldProps {
  /** Visible label; also the accessibility label. */
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  /** Validation message shown under the field (announced to screen readers). */
  readonly error?: string | null;
  readonly hint?: string;
  readonly keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly testID?: string;
  readonly autoFocus?: boolean;
}

/** Labelled 56 px text input with an error slot, on tokens only. */
export function TextField(p: TextFieldProps): ReactElement {
  const c = useThemeColors();
  const hasError = typeof p.error === 'string' && p.error.length > 0;
  return (
    <View style={{ gap: tokens.space[1] }}>
      <Text style={{ color: c.text, fontSize: tokens.type.caption.size, fontWeight: '600' }}>
        {p.label}
      </Text>
      <TextInput
        testID={p.testID}
        accessibilityLabel={p.label}
        accessibilityHint={p.hint}
        value={p.value}
        onChangeText={p.onChangeText}
        keyboardType={p.keyboardType ?? 'default'}
        maxLength={p.maxLength}
        placeholder={p.placeholder}
        placeholderTextColor={c.textMuted}
        autoFocus={p.autoFocus}
        style={{
          height: tokens.space[14],
          borderRadius: tokens.radius.md,
          borderWidth: hasError ? 2 : 1,
          borderColor: hasError ? c.danger : c.line,
          backgroundColor: c.surface,
          color: c.text,
          paddingHorizontal: tokens.space[4],
          fontSize: tokens.type.bodyL.size,
        }}
      />
      {hasError ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: c.danger, fontSize: tokens.type.caption.size }}
        >
          {p.error}
        </Text>
      ) : p.hint ? (
        <Text style={{ color: c.textMuted, fontSize: tokens.type.caption.size }}>{p.hint}</Text>
      ) : null}
    </View>
  );
}
