import type { ReactElement } from 'react';
import { Path, Svg } from 'react-native-svg';
import { ICON_PATHS, type IconName } from './generated/icon-paths.js';
import { ICON_STROKE, type IconProps } from './icon-props.js';

/** Creates a typed React Native icon component (react-native-svg) for an icon name. */
export function createNativeIcon(name: IconName): (props: IconProps) => ReactElement {
  function NativeIcon({
    size = 24,
    color = 'currentColor',
    accessibilityLabel,
  }: IconProps): ReactElement {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        accessible={accessibilityLabel !== undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityLabel ? 'image' : undefined}
      >
        {ICON_PATHS[name].map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    );
  }
  NativeIcon.displayName = `NativeIcon(${name})`;
  return NativeIcon;
}
