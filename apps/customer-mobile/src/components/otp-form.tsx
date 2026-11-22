import { OTP_LENGTH } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { AppText, Button, OtpInput } from '@delyva/ui-native';
import { type ReactElement, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { maskPhone } from '../features/phone';
import { t } from '../i18n';

/** OtpForm props. */
export interface OtpFormProps {
  readonly phone: string;
  /** Seconds before "Resend" unlocks (from the API's `resendAfterSeconds`). */
  readonly resendAfterSeconds: number;
  readonly onVerify: (code: string) => void;
  readonly onResend: () => void;
  readonly onChangeNumber: () => void;
  readonly verifying: boolean;
  readonly error: string | null;
}

/** Counts down once a second from `from` to 0; restarts when `from` or `epoch` changes. */
export function useCountdown(from: number, epoch: number): number {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    setLeft(from);
    const id = setInterval(() => {
      setLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1_000);
    return () => {
      clearInterval(id);
    };
  }, [from, epoch]);
  return left;
}

/** 6-digit OTP entry with auto-submit, resend timer and "change number". */
export function OtpForm({
  phone,
  resendAfterSeconds,
  onVerify,
  onResend,
  onChangeNumber,
  verifying,
  error,
}: OtpFormProps): ReactElement {
  const [code, setCode] = useState('');
  const [epoch, setEpoch] = useState(0);
  const left = useCountdown(resendAfterSeconds, epoch);
  const complete = code.length === OTP_LENGTH;
  return (
    <View style={{ gap: tokens.space[4] }}>
      <AppText variant="h1">{t('otp.title')}</AppText>
      <AppText tone="muted">{t('otp.body', { phone: maskPhone(phone) })}</AppText>
      <OtpInput
        value={code}
        label={t('otp.label')}
        error={error !== null}
        autoFocus
        onChange={(digits) => {
          setCode(digits);
          if (digits.length === OTP_LENGTH && !verifying) onVerify(digits);
        }}
      />
      {error ? (
        <AppText tone="danger" accessibilityLiveRegion="polite" testID="otp-error">
          {error}
        </AppText>
      ) : null}
      <Button
        label={t('otp.verify')}
        size="lg"
        loading={verifying}
        disabled={!complete}
        onPress={() => {
          onVerify(code);
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          onPress={onChangeNumber}
          style={{ minHeight: tokens.touchTarget, justifyContent: 'center' }}
        >
          <AppText tone="accent">{t('otp.changeNumber')}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: left > 0 }}
          disabled={left > 0}
          testID="otp-resend"
          onPress={() => {
            setCode('');
            setEpoch((e) => e + 1);
            onResend();
          }}
          style={{ minHeight: tokens.touchTarget, justifyContent: 'center' }}
        >
          <AppText tone={left > 0 ? 'muted' : 'accent'} numeric>
            {left > 0 ? t('otp.resendIn', { seconds: left }) : t('otp.resend')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
