import { tokens } from '@delyva/design-tokens';
import { type ComponentRef, type ReactElement, useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { AppText } from './app-text.js';
import { usePalette } from './theme.js';

/** OtpInput props. */
export interface OtpInputProps {
  readonly value: string;
  readonly onChange: (digits: string) => void;
  readonly length?: number;
  /** Accessibility label for the underlying field. */
  readonly label: string;
  readonly error?: boolean;
  readonly autoFocus?: boolean;
}

/** Keeps digits only and caps the length (pure; exported for tests). */
export function sanitizeOtp(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

/**
 * N-box OTP field backed by one input, so paste and SMS auto-fill (`oneTimeCode` /
 * Android `sms-otp`) work.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  label,
  error = false,
  autoFocus = false,
}: OtpInputProps): ReactElement {
  const c = usePalette();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      accessible={false}
      style={{ flexDirection: 'row', gap: tokens.space[2], justifyContent: 'center' }}
    >
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 48,
            height: 56,
            borderRadius: tokens.radius.md,
            borderWidth: i === value.length ? 2 : 1,
            borderColor: error ? c.danger : i === value.length ? c.buttonInk : c.line,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="h2" numeric>
            {value[i] ?? ''}
          </AppText>
        </View>
      ))}
      <TextInput
        ref={ref}
        testID="otp-input"
        accessibilityLabel={label}
        value={value}
        onChangeText={(t) => {
          onChange(sanitizeOtp(t, length));
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={{ position: 'absolute', opacity: 0.011, width: '100%', height: '100%' }}
      />
    </Pressable>
  );
}
