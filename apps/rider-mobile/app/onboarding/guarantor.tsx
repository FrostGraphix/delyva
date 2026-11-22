import { RiderGuarantorSchema } from '@delyva/contracts';
import { RiderBanner, Button, RiderTextField } from '@delyva/ui-native';
import { type ReactElement, useState } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { toE164Nigeria } from '../../src/lib/format';
import { stepNumber, TOTAL_STEPS } from '../../src/onboarding/routes';
import { useStepForm, useStepView } from '../../src/onboarding/use-step';
import { Screen } from '../../src/ui/screen';

/** Step 4 — guarantor name, phone and relationship. */
export default function GuarantorStep(): ReactElement {
  useStepView('guarantor');
  const form = useStepForm();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const submit = (): void => {
    const values = { fullName, phone: toE164Nigeria(phone) ?? phone, relationship };
    form.submit(RiderGuarantorSchema, values, (b) => api.saveRiderStep('guarantor', b));
  };
  return (
    <Screen
      testID="screen-onb-guarantor"
      eyebrow={t('onb.stepOf', { n: stepNumber('guarantor'), total: TOTAL_STEPS })}
      title={t('onb.guarantorTitle')}
      footer={
        <Button
          label={t('common.continue')}
          variant="brand"
          size="lg"
          loading={form.saving}
          onPress={submit}
        />
      }
    >
      {form.formError ? <RiderBanner tone="danger" text={form.formError} /> : null}
      <RiderTextField
        testID="guarantor-name"
        label={t('onb.guarantorName')}
        value={fullName}
        onChangeText={setFullName}
        error={form.errors.fullName}
      />
      <RiderTextField
        testID="guarantor-phone"
        label={t('onb.guarantorPhone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={form.errors.phone}
      />
      <RiderTextField
        testID="guarantor-relationship"
        label={t('onb.relationship')}
        value={relationship}
        onChangeText={setRelationship}
        error={form.errors.relationship}
      />
    </Screen>
  );
}
