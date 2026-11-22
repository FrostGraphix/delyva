import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Button } from './button.js';
import { Typography } from './typography.js';
import { useThemeColors } from './use-theme-colors.js';

/** Skeleton block rows shown while content loads (no spinners). */
export function Skeleton({ rows = 3, label }: { rows?: number; label: string }): ReactElement {
  const c = useThemeColors();
  const keys = Array.from({ length: rows }, (_, i) => `sk-${String(i)}`);
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={{ gap: tokens.space[3] }}
    >
      {keys.map((k) => (
        <View
          key={k}
          style={{
            height: tokens.space[14],
            borderRadius: tokens.radius.lg,
            backgroundColor: c.line,
          }}
        />
      ))}
    </View>
  );
}

/** Empty / error message props. */
export interface StateMessageProps {
  readonly title: string;
  readonly body?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly tone?: 'default' | 'danger';
  readonly testID?: string;
}

/** Empty / error state: plain-language message and one action. */
export function StateMessage(p: StateMessageProps): ReactElement {
  return (
    <View
      testID={p.testID}
      accessibilityLiveRegion="polite"
      style={{ gap: tokens.space[3], paddingVertical: tokens.space[6] }}
    >
      <Typography variant="h2" tone={p.tone === 'danger' ? 'danger' : 'default'} center>
        {p.title}
      </Typography>
      {p.body ? (
        <Typography tone="muted" center>
          {p.body}
        </Typography>
      ) : null}
      {p.actionLabel && p.onAction ? (
        <Button label={p.actionLabel} variant="ink" size="lg" onPress={p.onAction} />
      ) : null}
    </View>
  );
}

/** Banner props. */
export interface BannerProps {
  readonly text: string;
  readonly tone?: 'warning' | 'info' | 'danger' | 'success';
  readonly testID?: string;
}

/** Thin status banner (offline, queued actions); the text always states the state, not colour alone. */
export function Banner({ text, tone = 'warning', testID }: BannerProps): ReactElement {
  const c = useThemeColors();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        backgroundColor: c[tone],
        paddingVertical: tokens.space[2],
        paddingHorizontal: tokens.space[4],
        borderRadius: tokens.radius.md,
      }}
    >
      <Typography variant="body" tone={tone === 'warning' ? 'default' : 'inverse'}>
        {text}
      </Typography>
    </View>
  );
}
