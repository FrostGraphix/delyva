import { tokens } from '@delyva/design-tokens';
import { RiderBanner, Typography, useThemeColors } from '@delyva/ui-native';
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { useQueueStatus } from '../offline/trip-actions';
import { useOnline } from '../offline/use-online';

/** Screen props. */
export interface ScreenProps {
  /** Screen title (announced as the header). */
  readonly title?: string;
  /** Small line above the title (e.g. "Step 2 of 6"). */
  readonly eyebrow?: string;
  readonly children: ReactNode;
  /** Bottom thumb-zone area for the single primary action. */
  readonly footer?: ReactNode;
  /** Persistent bottom navigation. */
  readonly nav?: ReactNode;
  readonly testID?: string;
}

/**
 * Standard rider screen: safe area, offline + queued-action banners, scrollable body and a
 * bottom footer for the primary action (one-hand use).
 */
export function Screen({
  title,
  eyebrow,
  children,
  footer,
  nav,
  testID,
}: ScreenProps): ReactElement {
  const c = useThemeColors();
  const online = useOnline();
  const pending = useQueueStatus((s) => s.pending);
  return (
    <SafeAreaView testID={testID} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: tokens.space[4], gap: tokens.space[4], flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {!online ? <RiderBanner testID="offline-banner" text={t('common.offline')} /> : null}
        {pending > 0 ? (
          <RiderBanner testID="queue-banner" tone="info" text={t('common.queued', { count: pending })} />
        ) : null}
        {eyebrow ? (
          <Typography variant="caption" tone="muted">
            {eyebrow}
          </Typography>
        ) : null}
        {title ? (
          <Typography variant="h1" header>
            {title}
          </Typography>
        ) : null}
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ padding: tokens.space[4], gap: tokens.space[3], backgroundColor: c.bg }}>
          {footer}
        </View>
      ) : null}
      {nav}
    </SafeAreaView>
  );
}
