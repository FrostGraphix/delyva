import { tokens } from '@delyva/design-tokens';
import { AppText, usePalette } from '@delyva/ui-native';
import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { useSession } from '../src/auth/session-store';
import { t } from '../src/i18n';
import { usePrefs } from '../src/state/prefs-store';

/** Splash: brand mark while stores hydrate, then onboarding → address → home. */
export default function Splash(): ReactElement {
  const c = usePalette();
  const prefsReady = usePrefs((s) => s.hydrated);
  const onboarded = usePrefs((s) => s.onboarded);
  const address = usePrefs((s) => s.address);
  const sessionReady = useSession((s) => s.status !== 'loading');
  if (prefsReady && sessionReady) {
    if (!onboarded) return <Redirect href="/welcome" />;
    if (!address) return <Redirect href="/location" />;
    return <Redirect href="/home" />;
  }
  return (
    <View
      testID="splash"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.primary,
      }}
    >
      <AppText variant="display" tone="onPrimary">
        {t('app.name')}
      </AppText>
      <AppText tone="onPrimary" style={{ marginTop: tokens.space[2] }}>
        {t('app.tagline')}
      </AppText>
    </View>
  );
}
