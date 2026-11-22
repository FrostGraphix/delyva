import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from './app-text.js';
import { usePalette } from './theme.js';

/** OfflineBanner props. */
export interface OfflineBannerProps {
  readonly visible: boolean;
  readonly message: string;
  readonly icon?: ReactNode;
}

/** Live-region banner shown while the device is offline (cached data stays visible). */
export function OfflineBanner({ visible, message, icon }: OfflineBannerProps): ReactElement | null {
  const c = usePalette();
  if (!visible) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space[2],
        paddingHorizontal: tokens.space[4],
        paddingVertical: tokens.space[2],
        backgroundColor: c.buttonInk,
      }}
    >
      {icon}
      <AppText variant="caption" tone="inverse">
        {message}
      </AppText>
    </View>
  );
}
