import { RiderIdentitySchema } from '@delyva/contracts';
import { useMyRiderApplication } from '@delyva/sdk';
import { RiderBanner, Button, RiderTextField } from '@delyva/ui-native';
import { type ReactElement, useState } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { stepNumber, TOTAL_STEPS } from '../../src/onboarding/routes';
import { UploadField } from '../../src/onboarding/upload-field';
import { useStepForm, useStepView } from '../../src/onboarding/use-step';
import { Screen } from '../../src/ui/screen';

/** Step 2 — NIN + selfie for the KYC liveness check (fake provider in dev). */
export default function IdentityStep(): ReactElement {
  useStepView('identity');
  const app = useMyRiderApplication(api);
  const form = useStepForm((code) =>
    code === 'kyc_verification_failed'
      ? t('onb.kycFailed', { reason: app.data?.identity?.kycFailureReason ?? '' })
      : null,
  );
  const [nin, setNin] = useState('');
  const [selfie, setSelfie] = useState<string | null>(null);
  return (
    <Screen
      testID="screen-onb-identity"
      eyebrow={t('onb.stepOf', { n: stepNumber('identity'), total: TOTAL_STEPS })}
      title={t('onb.identityTitle')}
      footer={
        <Button
          label={t('common.continue')}
          variant="brand"
          size="lg"
          loading={form.saving}
          onPress={() => {
            form.submit(RiderIdentitySchema, { nin, selfieUploadId: selfie ?? '' }, (body) =>
              api.saveRiderStep('identity', body),
            );
          }}
        />
      }
    >
      {form.formError ? <RiderBanner tone="danger" text={form.formError} /> : null}
      <UploadField
        testID="selfie"
        purpose="selfie"
        label={t('onb.selfie')}
        hint={t('onb.selfieHint')}
        uploadId={selfie}
        onUploaded={setSelfie}
        error={form.errors.selfieUploadId}
      />
      <RiderTextField
        testID="nin"
        label={t('onb.nin')}
        value={nin}
        onChangeText={setNin}
        keyboardType="number-pad"
        maxLength={11}
        error={form.errors.nin}
      />
    </Screen>
  );
}
