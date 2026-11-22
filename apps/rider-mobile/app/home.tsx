import type { RiderProfile } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { BatteryIcon, MapPinIcon, PowerIcon } from '@delyva/icons/native';
import { useMyCurrentTrip, useMyRiderProfile, useSetRiderAvailability } from '@delyva/sdk';
import { RiderBanner, Button, RiderCard, StatTile, Typography, useThemeColors } from '@delyva/ui-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { MIN_BATTERY_PCT } from '../src/config';
import { t } from '../src/i18n';
import { useBatteryPct } from '../src/lib/battery';
import { formatBps } from '../src/lib/format';
import {
  currentFix,
  requestLocationPermission,
  useLocationStore,
} from '../src/location/location-store';
import { useOnline } from '../src/offline/use-online';
import { QueryView } from '../src/ui/query-view';
import { RiderNav } from '../src/ui/rider-nav';
import { Screen } from '../src/ui/screen';

/** Status card: offline/online with battery (always visible). */
function ShiftCard({
  profile,
  battery,
}: {
  profile: RiderProfile;
  battery: number | null;
}): ReactElement {
  const c = useThemeColors();
  const online = profile.status !== 'offline';
  return (
    <RiderCard testID="shift-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] }}>
        <PowerIcon size={32} color={online ? c.accentText : c.textMuted} />
        <Typography variant="h1" header testID="shift-status">
          {online ? t('home.online') : t('home.offline')}
        </Typography>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
        <BatteryIcon size={20} color={c.text} />
        <Typography testID="battery">
          {battery === null ? t('home.batteryUnknown') : t('home.battery', { pct: battery })}
        </Typography>
      </View>
    </RiderCard>
  );
}

/** Today's stats from the rider profile. */
function Stats({ profile }: { profile: RiderProfile }): ReactElement {
  const s = profile.stats;
  return (
    <View style={{ flexDirection: 'row', gap: tokens.space[3] }}>
      <StatTile
        testID="stat-offers"
        label={t('home.statsOffers')}
        value={String(s.offersReceived)}
        caption={`${t('home.statsAccepted')}: ${String(s.offersAccepted)}`}
      />
      <StatTile
        testID="stat-acceptance"
        label={t('home.acceptance')}
        value={formatBps(s.acceptanceRateBps)}
      />
    </View>
  );
}

/** Online waiting panel (map placeholder) and the busy-zone hint placeholder. */
function Waiting({ online }: { online: boolean }): ReactElement {
  const c = useThemeColors();
  return (
    <>
      {online ? (
        <RiderCard testID="waiting-panel">
          <MapPinIcon size={32} color={c.accentText} />
          <Typography variant="h2">{t('home.waiting')}</Typography>
          <Typography tone="muted">{t('home.waitingBody')}</Typography>
        </RiderCard>
      ) : null}
      {/* DEBT(dispatch): busy-zone hint is a placeholder — no demand/heatmap endpoint yet — add GET /v1/riders/me/zone-hints. */}
      <RiderCard testID="busy-zone">
        <Typography variant="h3">{t('home.busyZone')}</Typography>
        <Typography tone="muted">{t('home.busyZoneBody')}</Typography>
      </RiderCard>
    </>
  );
}

/** R04/R05 — home: go online/offline, battery, stats, waiting state, active trip shortcut. */
export default function HomeScreen(): ReactElement {
  const profile = useMyRiderProfile(api);
  const trip = useMyCurrentTrip(api);
  const toggle = useSetRiderAvailability(api);
  const battery = useBatteryPct();
  const permission = useLocationStore((s) => s.permission);
  const online = useOnline();
  const isOnline = (profile.data?.status ?? 'offline') !== 'offline';
  const lowBattery = battery !== null && battery < MIN_BATTERY_PCT;
  const goOnline = async (): Promise<void> => {
    if (battery === null) return;
    if ((await requestLocationPermission()) !== 'granted') return;
    const fix = await currentFix();
    if (fix) await api.postRiderLocations({ points: [fix] }).catch(() => undefined);
    toggle.mutate({ online: true, batteryPct: battery });
  };
  const primary = isOnline ? (
    <Button
      label={t('home.goOffline')}
      variant="ink"
      size="lg"
      loading={toggle.isPending}
      disabled={!online || battery === null}
      onPress={() => {
        toggle.mutate({ online: false, batteryPct: battery ?? 0 });
      }}
    />
  ) : (
    <Button
      label={t('home.goOnline')}
      variant="brand"
      size="lg"
      loading={toggle.isPending}
      disabled={!online || battery === null || lowBattery}
      onPress={() => {
        void goOnline();
      }}
    />
  );
  return (
    <Screen
      testID="screen-home"
      footer={profile.data ? primary : undefined}
      nav={<RiderNav active="home" />}
    >
      <QueryView query={profile}>
        {(p) => (
          <>
            <ShiftCard profile={p} battery={battery} />
            {permission === 'denied' ? (
              <RiderBanner tone="danger" testID="location-denied" text={t('home.locationDenied')} />
            ) : null}
            {lowBattery ? (
              <RiderBanner tone="danger" text={t('home.batteryLow', { pct: battery })} />
            ) : null}
            {toggle.isError ? <RiderBanner tone="danger" text={t('common.errorBody')} /> : null}
            {trip.data?.trip ? (
              <Button
                label={t('home.activeTrip')}
                variant="soft"
                size="lg"
                onPress={() => {
                  router.push('/trip');
                }}
              />
            ) : null}
            <Stats profile={p} />
            <Waiting online={p.status !== 'offline'} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
