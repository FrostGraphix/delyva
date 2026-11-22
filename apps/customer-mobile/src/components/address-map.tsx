import { tokens } from '@delyva/design-tokens';
import { MapPinIcon } from '@delyva/icons/native';
import { AppText } from '@delyva/ui-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { t } from '../i18n';
import type { MapPoint } from './order-map';

/** AddressMap props. */
export interface AddressMapProps {
  readonly point: MapPoint | null;
  readonly onMove: (p: MapPoint) => void;
}

/** Web fallback for the address pin: shows the chosen point; area chips set it. */
export function AddressMap({ point }: AddressMapProps): ReactElement {
  return (
    <View
      testID="address-map-fallback"
      style={{
        height: 140,
        borderRadius: tokens.radius.xl,
        backgroundColor: tokens.color.mint[100],
        alignItems: 'center',
        justifyContent: 'center',
        gap: tokens.space[2],
        padding: tokens.space[4],
      }}
    >
      <MapPinIcon size={32} color={tokens.color.ink[900]} />
      <AppText variant="caption" align="center" style={{ color: tokens.color.ink[700] }}>
        {point
          ? t('address.pinAt', { lat: point.lat.toFixed(4), lng: point.lng.toFixed(4) })
          : t('address.mapFallback')}
      </AppText>
    </View>
  );
}
