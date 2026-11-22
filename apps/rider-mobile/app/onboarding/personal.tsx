import { RiderPersonalDetailsSchema } from '@delyva/contracts';
import { useMyRiderApplication } from '@delyva/sdk';
import { Banner, Button, TextField } from '@delyva/ui-native';
import { type ReactElement, useEffect, useState } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { stepNumber, TOTAL_STEPS } from '../../src/onboarding/routes';
import { useStepForm, useStepView } from '../../src/onboarding/use-step';
import { Screen } from '../../src/ui/screen';

/** Step 1 — personal details. */
export default function PersonalStep(): ReactElement {
  useStepView('personal_details');
  const app = useMyRiderApplication(api);
  const form = useStepForm();
  const [v, setV] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    stateOfResidence: 'Lagos',
  });
  const saved = app.data?.personalDetails;
  useEffect(() => {
    if (saved) setV({ ...saved });
  }, [saved]);
  const field = (k: keyof typeof v) => (value: string) => {
    setV((prev) => ({ ...prev, [k]: value }));
  };
  return (
    <Screen
      testID="screen-onb-personal"
      eyebrow={t('onb.stepOf', { n: stepNumber('personal_details'), total: TOTAL_STEPS })}
      title={t('onb.personalTitle')}
      footer={
        <Button
          label={t('common.continue')}
          variant="brand"
          size="lg"
          loading={form.saving}
          onPress={() => {
            form.submit(RiderPersonalDetailsSchema, v, (body) =>
              api.saveRiderStep('personal_details', body),
            );
          }}
        />
      }
    >
      {form.formError ? <Banner tone="danger" text={form.formError} /> : null}
      <TextField
        testID="first-name"
        label={t('onb.firstName')}
        value={v.firstName}
        onChangeText={field('firstName')}
        error={form.errors.firstName}
      />
      <TextField
        testID="last-name"
        label={t('onb.lastName')}
        value={v.lastName}
        onChangeText={field('lastName')}
        error={form.errors.lastName}
      />
      <TextField
        testID="dob"
        label={t('onb.dob')}
        value={v.dateOfBirth}
        onChangeText={field('dateOfBirth')}
        error={form.errors.dateOfBirth}
        keyboardType="number-pad"
        maxLength={10}
      />
      <TextField
        testID="state"
        label={t('onb.state')}
        value={v.stateOfResidence}
        onChangeText={field('stateOfResidence')}
        error={form.errors.stateOfResidence}
      />
    </Screen>
  );
}
