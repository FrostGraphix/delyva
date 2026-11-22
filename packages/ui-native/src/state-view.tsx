import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from './app-text.js';
import { Button } from './button.js';
import { usePalette } from './theme.js';

/** StateView props. */
export interface StateViewProps {
  /** Illustration or icon (decorative). */
  readonly illustration?: ReactNode;
  readonly title: string;
  readonly message?: string;
  /** The one action of this state (retry, browse, …). */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly tone?: 'neutral' | 'error';
  readonly testID?: string;
}

/** Empty or error state: illustration, plain-language copy and a single action. */
export function StateView({
  illustration,
  title,
  message,
  actionLabel,
  onAction,
  tone = 'neutral',
  testID,
}: StateViewProps): ReactElement {
  const c = usePalette();
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{ alignItems: 'center', padding: tokens.space[6], gap: tokens.space[3] }}
    >
      {illustration ? (
        <View
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 72,
            height: 72,
            borderRadius: tokens.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone === 'error' ? c.surface : tokens.color.lime[100],
          }}
        >
          {illustration}
        </View>
      ) : null}
      <AppText variant="h3" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText tone="muted" align="center">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="ink" size="md" />
      ) : null}
    </View>
  );
}
