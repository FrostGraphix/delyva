import { tokens } from '@delyva/design-tokens';
import { MapPinIcon, ScooterIcon } from '@delyva/icons/native';
import { AppText, usePalette } from '@delyva/ui-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { t } from '../i18n';

/** A map point. */
export interface MapPoint {
  readonly lat: number;
  readonly lng: number;
}

/** OrderMap props (shared by the web fallback and the native map). */
export interface OrderMapProps {
  readonly pickup: MapPoint | null;
  readonly dropoff: MapPoint | null;
  readonly rider: MapPoint | null;
}

/**
 * Web/static fallback for the live map (react-native-maps has no web target): a flat panel
 * showing the rider state. Native builds resolve `order-map.native.tsx`.
 */
export function OrderMap({ rider }: OrderMapProps): ReactElement {
  const c = usePalette();
  return (
    <View
      testID="order-map-fallback"
      accessible
      accessibilityLabel={t('track.mapFallback')}
      style={{
        height: 160,
        borderRadius: tokens.radius.xl,
        backgroundColor: tokens.color.mint[100],
        alignItems: 'center',
        justifyContent: 'center',
        gap: tokens.space[2],
        flexDirection: 'row',
      }}
    >
      <ScooterIcon size={32} color={tokens.color.ink[900]} />
      <View style={{ width: 48, height: 2, backgroundColor: c.primary }} />
      <MapPinIcon size={32} color={tokens.color.ink[900]} />
      <View style={{ position: 'absolute', bottom: tokens.space[2] }}>
        <AppText variant="caption" style={{ color: tokens.color.ink[700] }}>
          {rider ? `${rider.lat.toFixed(4)}, ${rider.lng.toFixed(4)}` : t('track.mapFallback')}
        </AppText>
      </View>
    </View>
  );
}
