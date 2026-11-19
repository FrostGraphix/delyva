import type { ReactElement } from 'react';
import { ICON_PATHS, type IconName } from './generated/icon-paths.js';
import { ICON_STROKE, type IconProps } from './icon-props.js';

/** Creates a typed web (React DOM) icon component for an icon name. */
export function createWebIcon(name: IconName): (props: IconProps) => ReactElement {
  function WebIcon({
    size = 24,
    color = 'currentColor',
    accessibilityLabel,
  }: IconProps): ReactElement {
    const a11y = accessibilityLabel
      ? { role: 'img', 'aria-label': accessibilityLabel }
      : { 'aria-hidden': true };
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...a11y}
      >
        {ICON_PATHS[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  WebIcon.displayName = `Icon(${name})`;
  return WebIcon;
}
