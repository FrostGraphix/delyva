import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { Text, TextInput, View } from 'react-native';
import { sanitizeCode } from './sanitize-code.js';
import { useThemeColors } from './use-theme-colors.js';

/** Code input props. */
export interface CodeInputProps {
  /** Accessibility label, e.g. "Enter the 6-digit code". */
  readonly label: string;
  readonly length: number;
  readonly value: string;
  /** Receives digits only, trimmed to `length`. */
  readonly onChange: (digits: string) => void;
  readonly error?: string | null;
  readonly testID?: string;
  readonly autoFocus?: boolean;
}

const SLOT_WIDTH = tokens.space[10] + tokens.space[2];

/**
 * Large-digit code entry (OTP, pickup code, delivery OTP). One real input (so paste and SMS
 * auto-fill work) above boxes big enough to read in sunlight.
 */
export function CodeInput(p: CodeInputProps): ReactElement {
  const c = useThemeColors();
  const hasError = typeof p.error === 'string' && p.error.length > 0;
  const slots = Array.from({ length: p.length }, (_, i) => ({ pos: i, d: p.value[i] ?? '' }));
  return (
    <View style={{ gap: tokens.space[2] }}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: tokens.space[2], justifyContent: 'center' }}
      >
        {slots.map((s) => (
          <View
            key={`slot-${String(s.pos)}`}
            style={{
              width: SLOT_WIDTH,
              height: tokens.space[14],
              borderRadius: tokens.radius.md,
              borderWidth: 2,
              borderColor: hasError ? c.danger : s.pos === p.value.length ? c.primary : c.line,
              backgroundColor: c.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.text, fontSize: tokens.type.h1.size, fontWeight: '800' }}>
              {s.d}
            </Text>
          </View>
        ))}
      </View>
      <TextInput
        testID={p.testID}
        accessibilityLabel={p.label}
        value={p.value}
        onChangeText={(v) => {
          p.onChange(sanitizeCode(v, p.length));
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={p.length}
        autoFocus={p.autoFocus}
        style={{
          height: tokens.touchTarget,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: c.line,
          color: c.text,
          backgroundColor: c.surface,
          textAlign: 'center',
          fontSize: tokens.type.bodyL.size,
          letterSpacing: tokens.space[2],
        }}
      />
      {hasError ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: c.danger, fontSize: tokens.type.body.size, textAlign: 'center' }}
        >
          {p.error}
        </Text>
      ) : null}
    </View>
  );
}
