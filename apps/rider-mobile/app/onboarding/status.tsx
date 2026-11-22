import type { RiderApplication } from '@delyva/contracts';
import { useMyRiderApplication } from '@delyva/sdk';
import { ClockIcon, CheckCircleIcon, XIcon } from '@delyva/icons/native';
import { Banner, Button, Card, Typography, useThemeColors } from '@delyva/ui-native';
import { router } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { api, refreshSession } from '../../src/api/client';
import { t } from '../../src/i18n';
import { QueryView } from '../../src/ui/query-view';
import { Screen } from '../../src/ui/screen';

/** Status card for one application state. */
function StatusCard({ app }: { app: RiderApplication }): ReactElement {
  const c = useThemeColors();
  if (app.status === 'approved') {
    return (
      <Card testID="status-approved">
        <CheckCircleIcon size={32} color={c.accentText} />
        <Typography variant="h2">{t('status.approved')}</Typography>
        <Typography tone="muted">{t('status.approvedBody')}</Typography>
      </Card>
    );
  }
  if (app.status === 'rejected') {
    return (
      <Card testID="status-rejected">
        <XIcon size={32} color={c.danger} />
        <Typography variant="h2">{t('status.rejected')}</Typography>
        <Typography tone="muted">
          {t('status.rejectedBody', { reason: app.rejectionReason ?? '—' })}
        </Typography>
      </Card>
    );
  }
  return (
    <Card testID="status-pending">
      <ClockIcon size={32} color={c.accentText} />
      <Typography variant="h2">{t('status.pending')}</Typography>
      <Typography tone="muted">{t('status.pendingBody')}</Typography>
    </Card>
  );
}

/** R03 — application status; after approval refreshes the token to pick up the `rider` role. */
export default function StatusScreen(): ReactElement {
  const app = useMyRiderApplication(api);
  const [failed, setFailed] = useState(false);
  const approved = app.data?.status === 'approved';
  const start = (): void => {
    setFailed(false);
    void refreshSession().then((token) => {
      if (token) router.replace('/');
      else setFailed(true);
    });
  };
  return (
    <Screen
      testID="screen-onb-status"
      title={t('status.title')}
      footer={
        approved ? (
          <Button label={t('status.start')} variant="brand" size="lg" onPress={start} />
        ) : (
          <Button
            label={t('status.refresh')}
            variant="ink"
            size="lg"
            loading={app.isFetching}
            onPress={() => {
              void app.refetch();
            }}
          />
        )
      }
    >
      {failed ? <Banner tone="danger" text={t('common.errorBody')} /> : null}
      <QueryView query={app}>{(data) => <StatusCard app={data} />}</QueryView>
    </Screen>
  );
}
