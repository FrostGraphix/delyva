import type { DispatchPoint } from '@delyva/contracts';

/** Platforms the hand-off supports. */
export type MapsPlatform = 'ios' | 'android' | 'web';

/**
 * Turn-by-turn hand-off URL: Apple Maps on iOS, the Google Maps navigation intent on Android,
 * and the Google Maps directions URL on web (also the universal fallback).
 */
export function mapsUrl(to: DispatchPoint, platform: MapsPlatform): string {
  const ll = `${String(to.lat)},${String(to.lng)}`;
  if (platform === 'ios') return `http://maps.apple.com/?daddr=${ll}&dirflg=d`;
  if (platform === 'android') return `google.navigation:q=${ll}&mode=l`;
  return webMapsUrl(to);
}

/** Google Maps directions URL (works in any browser). */
export function webMapsUrl(to: DispatchPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${String(to.lat)},${String(to.lng)}&travelmode=driving`;
}
