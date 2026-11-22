import type { RiderApplication } from '@delyva/contracts';
import { onboardingKeys, useMyRiderApplication } from '@delyva/sdk';
import { Banner, Button, Card, Typography } from '@delyva/ui-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactElement, useRef } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { newId } from '../../src/lib/ids';
import { QueryView } from '../../src/ui/query-view';
import { Screen } from '../../src/ui/screen';

/** Masked summary of what the rider entered (PII stays masked by the API). */
function Summary({ app }: { app: RiderApplication }): ReactElement {
  const p = app.personalDetails;
  return (
    <Card testID="review-summary">
      <Typography variant="h3">{p ? `${p.firstName} ${p.lastName}` : '—'}</Typography>
      <Typography tone="muted">{`NIN •••• ${app.identity?.ninLast4 ?? '—'}`}</Typography>
      <Typography tone="muted">
        {app.vehicle ? t(`onb.vehicle.${app.vehicle.vehicleType}`) : '—'}
      </Typography>
      <Typography tone="muted">
        {app.guarantor ? `${app.guarantor.fullName} (${app.guarantor.relationship})` : '—'}
      </Typography>
      <Typography tone="muted">
        {app.bankAccount
          ? `${app.bankAccount.accountName} •••• ${app.bankAccount.accountNumberLast4}`
          : '—'}
      </Typography>
      {app.quiz ? (
        <Typography tone="accent">
          {t('onb.quizPassed', { score: app.quiz.scorePercent })}
        </Typography>
      ) : null}
    </Card>
  );
}

/** Final check and submit for ops review. */
export default function ReviewStep(): ReactElement {
  const app = useMyRiderApplication(api);
  const qc = useQueryClient();
  const key = useRef(newId());
  const submit = useMutation({
    mutationFn: () => api.submitRiderApplication(key.current),
    onSuccess: (data) => {
      qc.setQueryData(onboardingKeys.rider(), data);
      router.replace('/onboarding/status');
    },
  });
  return (
    <Screen
      testID="screen-onb-review"
      title={t('onb.reviewTitle')}
      footer={
        <Button
          label={t('onb.submit')}
          variant="brand"
          size="lg"
          loading={submit.isPending}
          onPress={() => {
            submit.mutate();
          }}
        />
      }
    >
      <Typography tone="muted">{t('onb.reviewBody')}</Typography>
      {submit.isError ? <Banner tone="danger" text={t('common.errorBody')} /> : null}
      <QueryView query={app}>{(data) => <Summary app={data} />}</QueryView>
    </Screen>
  );
}
