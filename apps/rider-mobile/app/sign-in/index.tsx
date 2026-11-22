import { Button, TextField, Typography } from '@delyva/ui-native';
import { useRequestOtp } from '@delyva/sdk';
import { router } from 'expo-router';
import { type ReactElement, useRef, useState } from 'react';
import { api } from '../../src/api/client';
import { problemCode } from '../../src/api/errors';
import { t } from '../../src/i18n';
import { toE164Nigeria } from '../../src/lib/format';
import { newId } from '../../src/lib/ids';
import { useOnline } from '../../src/offline/use-online';
import { Screen } from '../../src/ui/screen';

/** R01 — phone number entry; sends the OTP (idempotent per number). */
export default function PhoneScreen(): ReactElement {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const online = useOnline();
  const request = useRequestOtp(api);
  const submit = (): void => {
    const e164 = toE164Nigeria(phone);
    if (!e164) {
      setError(t('auth.phoneInvalid'));
      return;
    }
    setError(null);
    const key = keys.current.get(e164) ?? newId();
    keys.current.set(e164, key);
    request.mutate(
      { phone: e164, idempotencyKey: key },
      {
        onSuccess: (res) => {
          router.push({
            pathname: '/sign-in/otp',
            params: { phone: e164, resendAfter: String(res.resendAfterSeconds) },
          });
        },
        onError: (err) => {
          setError(
            problemCode(err) === 'rate_limited' ? t('auth.rateLimited') : t('common.errorBody'),
          );
        },
      },
    );
  };
  return (
    <Screen
      testID="screen-phone"
      title={t('auth.phoneTitle')}
      footer={
        <Button
          label={t('auth.sendCode')}
          variant="brand"
          size="lg"
          loading={request.isPending}
          disabled={!online}
          onPress={submit}
        />
      }
    >
      <Typography tone="muted">{t('auth.phoneBody')}</Typography>
      <TextField
        testID="phone-input"
        label={t('auth.phoneLabel')}
        hint={t('auth.phoneHint')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={15}
        error={error}
        autoFocus
      />
    </Screen>
  );
}
