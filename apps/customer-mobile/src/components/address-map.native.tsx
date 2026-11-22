import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import MapView, { Marker } from 'react-native-maps';
import { t } from '../i18n';
import type { AddressMapProps } from './address-map';

const LAGOS = { lat: 6.5244, lng: 3.3792 };

/** Native address pin: drag the marker to the gate/entrance. */
export function AddressMap({ point, onMove }: AddressMapProps): ReactElement {
  const p = point ?? LAGOS;
  return (
    <MapView
      accessibilityLabel={t('address.mapHint')}
      style={{ height: 200, borderRadius: tokens.radius.xl }}
      region={{ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
    >
      <Marker
        draggable
        coordinate={{ latitude: p.lat, longitude: p.lng }}
        onDragEnd={(e) => {
          onMove({
            lat: e.nativeEvent.coordinate.latitude,
            lng: e.nativeEvent.coordinate.longitude,
          });
        }}
        pinColor={tokens.color.brand.primary}
      />
    </MapView>
  );
}
