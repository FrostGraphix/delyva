import { useMyRiderProfile } from '@delyva/sdk';
import { Button, RiderCard, Typography } from '@delyva/ui-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { api } from '../src/api/client';
import { t } from '../src/i18n';
import { disconnectRealtime } from '../src/realtime/realtime-store';
import { useSession } from '../src/session/session-store';
import { QueryView } from '../src/ui/query-view';
import { RiderNav } from '../src/ui/rider-nav';
import { Screen } from '../src/ui/screen';

/** One label/value row. */
function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <RiderCard>
      <Typography variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography variant="h3">{value}</Typography>
    </RiderCard>
  );
}

/** R13 — rider profile and sign-out. */
export default function ProfileScreen(): ReactElement {
  const profile = useMyRiderProfile(api);
  const qc = useQueryClient();
  const refreshToken = useSession((s) => s.refreshToken);
  const signOut = useSession((s) => s.signOut);
  const onSignOut = (): void => {
    const logout = refreshToken
      ? api.logout({ refreshToken }).catch(() => undefined)
      : Promise.resolve();
    void logout.then(async () => {
      disconnectRealtime();
      qc.clear();
      await signOut();
      router.replace('/sign-in');
    });
  };
  return (
    <Screen
      testID="screen-profile"
      title={t('profile.title')}
      nav={<RiderNav active="profile" />}
      footer={<Button label={t('profile.signOut')} variant="ghost" size="lg" onPress={onSignOut} />}
    >
      <QueryView query={profile}>
        {(p) => (
          <>
            <Row label={t('profile.rating')} value={p.rating.toFixed(1)} />
            <Row label={t('profile.plate')} value={p.vehiclePlate ?? t('profile.notSet')} />
            <Row label={t('profile.hub')} value={p.hub ?? t('profile.notSet')} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
