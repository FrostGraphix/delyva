import type { AdminDispatchRider } from '@delyva/contracts';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

/** Lagos bounding box (south, west, north, east) used for the schematic plot. */
export const LAGOS_BOUNDS = { south: 6.38, west: 3.25, north: 6.7, east: 3.65 } as const;

const W = 400;
const H = 260;

/** Projects lat/lng into the plot's viewBox (equirectangular; fine at city scale). */
export function project(lat: number, lng: number): { x: number; y: number } {
  const b = LAGOS_BOUNDS;
  const x = ((lng - b.west) / (b.east - b.west)) * W;
  const y = ((b.north - lat) / (b.north - b.south)) * H;
  return { x: Math.min(W, Math.max(0, x)), y: Math.min(H, Math.max(0, y)) };
}

/**
 * Schematic rider plot. DEBT(admin-web): no map tiles — Google Maps JS needs a browser key and
 * CSP allowances — swap for react-google-maps (or Mapbox) with a restricted key in Phase 1 hardening.
 */
export function RidersMap({
  riders,
}: {
  readonly riders: readonly AdminDispatchRider[];
}): ReactNode {
  const placed = riders.filter((r) => r.position !== null);
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={t('live.mapLabel')}
        className="w-full rounded-lg border border-line bg-bg"
      >
        {[1, 2, 3].map((i) => (
          <line
            key={`v${String(i)}`}
            x1={(W / 4) * i}
            x2={(W / 4) * i}
            y1={0}
            y2={H}
            className="stroke-line"
          />
        ))}
        {[1, 2].map((i) => (
          <line
            key={`h${String(i)}`}
            y1={(H / 3) * i}
            y2={(H / 3) * i}
            x1={0}
            x2={W}
            className="stroke-line"
          />
        ))}
        {placed.map((r) => {
          const p = project(r.position?.lat ?? 0, r.position?.lng ?? 0);
          return (
            <g key={r.riderId}>
              <title>{`${t('live.rider', { id: r.riderId.slice(0, 8) })} · ${t(`rider.status.${r.status}`)}`}</title>
              <circle
                cx={p.x}
                cy={p.y}
                r={6}
                className={
                  r.status === 'on_trip'
                    ? 'fill-info stroke-surface'
                    : 'fill-primary stroke-surface'
                }
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="text-micro text-text-muted">{t('live.mapDebt')}</figcaption>
    </figure>
  );
}
