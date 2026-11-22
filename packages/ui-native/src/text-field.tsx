import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { AppText } from './app-text.js';
import { usePalette } from './theme.js';

/** TextField props. */
export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Visible label (also the accessibility label). */
  readonly label: string;
  readonly leading?: ReactNode;
  readonly error?: string | null;
  readonly hideLabel?: boolean;
}

/** Flat rounded input with optional leading icon/prefix and inline error. */
export function TextField({
  label,
  leading,
  error,
  hideLabel = false,
  ...input
}: TextFieldProps): ReactElement {
  const c = usePalette();
  return (
    <View style={{ gap: tokens.space[1] }}>
      {hideLabel ? null : (
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space[2],
          minHeight: tokens.touchTarget + 4,
          paddingHorizontal: tokens.space[4],
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          borderColor: error ? c.danger : c.line,
          backgroundColor: c.surface,
        }}
      >
        {leading}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textMuted}
          {...input}
          style={{
            flex: 1,
            minHeight: tokens.touchTarget,
            color: c.text,
            fontSize: tokens.type.bodyL.size,
            fontFamily: tokens.font.family.body,
          }}
        />
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
