import { OTP_LENGTH } from '@delyva/contracts';
import { useRequestOtp, useVerifyOtp } from '@delyva/sdk';
import { Button, CodeInput, Typography } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useEffect, useState } from 'react';
import { api } from '../../src/api/client';
import { problemCode } from '../../src/api/errors';
import { t } from '../../src/i18n';
import { newId } from '../../src/lib/ids';
import { useOnline } from '../../src/offline/use-online';
import { useSession } from '../../src/session/session-store';
import { Screen } from '../../src/ui/screen';

/** Seconds until resend is allowed, ticking down once per second. */
function useResendTimer(initial: number): [number, (s: number) => void] {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = setTimeout(() => {
      setLeft(left - 1);
    }, 1_000);
    return () => {
      clearTimeout(timer);
    };
  }, [left]);
  return [left, setLeft];
}

const otpError = (err: unknown): string =>
  problemCode(err) === 'rate_limited' ? t('auth.rateLimited') : t('auth.otpWrong');

/** R01b — 6-digit OTP entry with resend timer; stores tokens in secure storage. */
export default function OtpScreen(): ReactElement {
  const params = useLocalSearchParams<{ phone: string; resendAfter?: string }>();
  const phone = params.phone;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useResendTimer(Number(params.resendAfter ?? '30'));
  const online = useOnline();
  const verify = useVerifyOtp(api);
  const resend = useRequestOtp(api);
  const deviceId = useSession((s) => s.deviceId);
  const setTokens = useSession((s) => s.setTokens);
  const submit = (): void => {
    if (!deviceId || code.length !== OTP_LENGTH) return;
    verify.mutate(
      { phone, code, deviceId },
      {
        onSuccess: (pair) => {
          void setTokens(pair).then(() => {
            router.replace('/');
          });
        },
        onError: (err) => {
          setError(otpError(err));
        },
      },
    );
  };
  const onResend = (): void => {
    resend.mutate(
      { phone, idempotencyKey: newId() },
      {
        onSuccess: (r) => {
          setResendIn(r.resendAfterSeconds);
        },
        onError: (err) => {
          setError(otpError(err));
        },
      },
    );
  };
  return (
    <Screen
      testID="screen-otp"
      title={t('auth.otpTitle')}
      footer={
        <>
          <Button
            label={t('auth.verify')}
            variant="brand"
            size="lg"
            loading={verify.isPending}
            disabled={!online || code.length !== OTP_LENGTH}
            onPress={submit}
          />
          <Button
            label={resendIn > 0 ? t('auth.resendIn', { seconds: resendIn }) : t('auth.resend')}
            variant="ghost"
            size="md"
            disabled={resendIn > 0 || !online}
            onPress={onResend}
          />
        </>
      }
    >
      <Typography tone="muted">{t('auth.otpBody', { phone })}</Typography>
      <CodeInput
        testID="otp-input"
        label={t('auth.otpLabel')}
        length={OTP_LENGTH}
        value={code}
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
        error={error}
        autoFocus
      />
    </Screen>
  );
}
