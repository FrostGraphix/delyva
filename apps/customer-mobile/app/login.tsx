import { tokens } from '@delyva/design-tokens';
import { ApiError, useRequestOtp, useVerifyOtp } from '@delyva/sdk';
import { AppText, Button, TextField } from '@delyva/ui-native';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { api } from '../src/api/client';
import { useSession } from '../src/auth/session-store';
import { OtpForm } from '../src/components/otp-form';
import { Screen } from '../src/components/screen';
import { track } from '../src/device/analytics';
import { toNigeriaE164 } from '../src/features/phone';
import { syncGuestCart } from '../src/hooks/use-cart';
import { t } from '../src/i18n';
import { usePrefs } from '../src/state/prefs-store';

function otpError(e: unknown): string {
  if (e instanceof ApiError && e.problem.status === 429) return t('otp.rateLimited');
  return t('otp.error');
}

/** C03/C04: phone + OTP, asked only when it is needed (checkout, inbox, wallet). */
export default function Login(): ReactElement {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const qc = useQueryClient();
  const request = useRequestOtp(api);
  const verify = useVerifyOtp(api);
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState<{ phone: string; resendAfter: number; key: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const phone = toNigeriaE164(raw);
  const firstName = usePrefs((s) => s.firstName);

  const send = (target: string, key: string): void => {
    setError(null);
    request.mutate(
      { phone: target, idempotencyKey: key },
      {
        onSuccess: (r) => {
          setSent({ phone: target, resendAfter: r.resendAfterSeconds, key });
          track({ name: 'onboarding_step_completed', step: 'phone' });
        },
        onError: (e) => {
          setError(otpError(e));
        },
      },
    );
  };

  const onVerify = (code: string): void => {
    const deviceId = useSession.getState().deviceId;
    if (!sent || !deviceId) return;
    setError(null);
    verify.mutate(
      { phone: sent.phone, code, deviceId },
      {
        onSuccess: (pair) => {
          void (async () => {
            await useSession.getState().setTokens(pair);
            track({ name: 'onboarding_step_completed', step: 'otp' });
            await syncGuestCart().catch(() => undefined);
            await qc.invalidateQueries();
            const next = (redirect ?? '/home') as Href;
            if (firstName) router.navigate(next);
            else router.navigate({ pathname: '/name', params: { redirect: redirect ?? '/home' } });
          })();
        },
        onError: (e) => {
          setError(otpError(e));
        },
      },
    );
  };

  if (sent) {
    return (
      <Screen back testID="otp">
        <OtpForm
          phone={sent.phone}
          resendAfterSeconds={sent.resendAfter}
          verifying={verify.isPending}
          error={error}
          onVerify={onVerify}
          onResend={() => {
            send(sent.phone, randomUUID());
          }}
          onChangeNumber={() => {
            setSent(null);
            setError(null);
          }}
        />
      </Screen>
    );
  }
  return (
    <Screen
      back
      testID="login"
      footer={
        <Button
          label={t('login.send')}
          size="lg"
          loading={request.isPending}
          onPress={() => {
            setTouched(true);
            if (phone) send(phone, randomUUID());
          }}
        />
      }
    >
      <AppText variant="h1">{t('login.title')}</AppText>
      <AppText tone="muted">{t('login.body')}</AppText>
      <TextField
        label={t('login.phone')}
        placeholder={t('login.phonePlaceholder')}
        value={raw}
        onChangeText={setRaw}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        testID="login-phone"
        leading={
          <AppText style={{ fontWeight: '700' }} numeric>
            +234
          </AppText>
        }
        error={touched && !phone ? t('login.phoneError') : error}
      />
      <AppText variant="caption" tone="muted" style={{ marginTop: tokens.space[2] }}>
        {t('login.terms')}
      </AppText>
    </Screen>
  );
}
