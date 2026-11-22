import { tokens } from '@delyva/design-tokens';
import { CrosshairIcon } from '@delyva/icons/native';
import { AppText, Button, usePalette } from '@delyva/ui-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { type ReactElement, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../src/components/screen';
import { track } from '../src/device/analytics';
import { t } from '../src/i18n';

/** C06a: explains why before the OS prompt; denial falls through to manual entry. */
export default function LocationPriming(): ReactElement {
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    track({ name: 'onboarding_step_viewed', step: 'location' });
  }, []);
  const useMyLocation = async (): Promise<void> => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      track({ name: 'onboarding_step_completed', step: 'location' });
      router.replace({
        pathname: '/address',
        params: { lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) },
      });
    } catch {
      setDenied(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      scroll={false}
      testID="location"
      footer={
        <View style={{ gap: tokens.space[3] }}>
          <Button
            label={busy ? t('location.locating') : t('location.allow')}
            size="lg"
            loading={busy}
            onPress={() => {
              void useMyLocation();
            }}
          />
          <Button
            label={t('location.manual')}
            variant="ghost"
            onPress={() => {
              router.replace('/address');
            }}
          />
        </View>
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: tokens.space[4] }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: tokens.radius.pill,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CrosshairIcon size={32} color={c.onPrimary} />
        </View>
        <AppText variant="display">{t('location.title')}</AppText>
        <AppText variant="bodyL" tone="muted">
          {t('location.body')}
        </AppText>
        {denied ? (
          <AppText tone="danger" accessibilityLiveRegion="polite" testID="location-denied">
            {t('location.denied')}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
