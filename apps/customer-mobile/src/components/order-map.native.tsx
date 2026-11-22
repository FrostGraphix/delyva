import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import MapView, { Marker } from 'react-native-maps';
import { t } from '../i18n';
import type { MapPoint, OrderMapProps } from './order-map';

const DELTA = 0.04;

function centre(points: readonly (MapPoint | null)[]): MapPoint {
  const ps = points.filter((p): p is MapPoint => p !== null);
  if (ps.length === 0) return { lat: 6.5244, lng: 3.3792 };
  return {
    lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
    lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
  };
}

/**
 * Native live map (Google Maps on Android, Apple Maps on iOS) with vendor, drop-off and the
 * rider's live position. DEBT(maps): Android needs a Google Maps key in app config — no key provisioned yet — add via EAS secrets.
 */
export function OrderMap({ pickup, dropoff, rider }: OrderMapProps): ReactElement {
  const c = centre([pickup, dropoff, rider]);
  return (
    <MapView
      accessibilityLabel={t('track.title')}
      style={{ height: 220, borderRadius: tokens.radius.xl }}
      region={{ latitude: c.lat, longitude: c.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }}
      toolbarEnabled={false}
    >
      {pickup ? <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} /> : null}
      {dropoff ? <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} /> : null}
      {rider ? (
        <Marker
          coordinate={{ latitude: rider.lat, longitude: rider.lng }}
          pinColor={tokens.color.brand.primary}
        />
      ) : null}
    </MapView>
  );
}
