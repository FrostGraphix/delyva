import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Typography } from './typography.js';
import { useThemeColors } from './use-theme-colors.js';

/** Stat tile props. */
export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly caption?: string;
  readonly testID?: string;
}

/** Glanceable metric tile (label, big value, caption). */
export function StatTile({ label, value, caption, testID }: StatTileProps): ReactElement {
  const c = useThemeColors();
  const a11y = caption ? `${label}: ${value}, ${caption}` : `${label}: ${value}`;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11y}
      style={{
        flex: 1,
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: tokens.radius.xl,
        padding: tokens.space[4],
        gap: tokens.space[1],
      }}
    >
      <Typography variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography variant="h1">{value}</Typography>
      {caption ? (
        <Typography variant="caption" tone="muted">
          {caption}
        </Typography>
      ) : null}
    </View>
  );
}
