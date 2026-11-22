import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { glassStyleSpec } from './glass-styles.js';
import { useScheme } from './theme.js';

/** GlassSurface props. */
export interface GlassSurfaceProps {
  readonly children: ReactNode;
  readonly radius?: number;
  readonly style?: ViewStyle;
  /** Solid fallback (reduced transparency, low-end devices). */
  readonly solid?: boolean;
  readonly testID?: string;
}

/** Floating "liquid glass" layer: tab bar, sheets and overlays on maps/photos only. */
export function GlassSurface({
  children,
  radius = tokens.radius['3xl'],
  style,
  solid = false,
  testID,
}: GlassSurfaceProps): ReactElement {
  const g = glassStyleSpec(useScheme(), solid);
  // react-native-web forwards backdropFilter to CSS; native ignores it and keeps the fill.
  const web = (
    Platform.OS === 'web' && !solid ? { backdropFilter: g.backdropFilter } : {}
  ) as ViewStyle;
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: g.backgroundColor,
        borderColor: g.borderColor,
        borderWidth: g.borderWidth,
        borderRadius: radius,
        shadowColor: g.shadowColor,
        shadowOpacity: g.shadowOpacity,
        shadowRadius: g.shadowRadius,
        shadowOffset: { width: 0, height: 10 },
        elevation: g.elevation,
        ...web,
        ...style,
      }}
    >
      {children}
    </View>
  );
}
