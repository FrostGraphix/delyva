import { AppText, Button, TextField } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { Screen } from '../src/components/screen';
import { track } from '../src/device/analytics';
import { t } from '../src/i18n';
import { usePrefs } from '../src/state/prefs-store';

/**
 * C05: first name only.
 * DEBT(identity): name kept on device only — identity has no profile endpoint yet — PATCH /v1/me when it lands.
 */
export default function NameScreen(): ReactElement {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const setFirstName = usePrefs((s) => s.setFirstName);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = name.trim().length >= 1 && name.trim().length <= 40;
  return (
    <Screen
      testID="name"
      footer={
        <Button
          label={t('common.continue')}
          size="lg"
          onPress={() => {
            setTouched(true);
            if (!valid) return;
            setFirstName(name.trim());
            track({ name: 'onboarding_step_completed', step: 'name' });
            router.replace(redirect ?? '/home');
          }}
        />
      }
    >
      <AppText variant="h1">{t('name.title')}</AppText>
      <TextField
        label={t('name.label')}
        placeholder={t('name.placeholder')}
        value={name}
        onChangeText={setName}
        autoComplete="given-name"
        autoFocus
        testID="name-input"
        error={touched && !valid ? t('name.error') : null}
      />
    </Screen>
  );
}
