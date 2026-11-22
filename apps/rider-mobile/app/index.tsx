import { RiderSkeleton, RiderStateMessage } from '@delyva/ui-native';
import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';
import { API_URL } from '../src/config';
import { t } from '../src/i18n';
import { isRider, useSession } from '../src/session/session-store';
import { Screen } from '../src/ui/screen';

/** Entry gate: sign-in, onboarding, or the rider home depending on the session. */
export default function Gate(): ReactElement {
  const status = useSession((s) => s.status);
  const rider = useSession((s) => isRider(s.roles));
  if (API_URL === '') {
    return (
      <Screen>
        <RiderStateMessage
          tone="danger"
          title={t('common.errorTitle')}
          body={t('common.configMissing')}
        />
      </Screen>
    );
  }
  if (status === 'loading') {
    return (
      <Screen>
        <RiderSkeleton label={t('common.loading')} />
      </Screen>
    );
  }
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  return <Redirect href={rider ? '/home' : '/onboarding'} />;
}
