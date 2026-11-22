import { tokens } from '@delyva/design-tokens';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { AppText } from './app-text.js';
import { usePalette } from './theme.js';

/** ProgressSteps props. */
export interface ProgressStepsProps {
  /** Step labels in order. */
  readonly steps: readonly string[];
  /** Index of the current step (0-based); -1 when none reached. */
  readonly current: number;
  /** Accessibility summary, e.g. "Step 2 of 5: Preparing". */
  readonly accessibilityLabel: string;
}

/** Segmented tracking bar (5 steps on the tracking screen); labels never rely on colour alone. */
export function ProgressSteps({
  steps,
  current,
  accessibilityLabel,
}: ProgressStepsProps): ReactElement {
  const c = usePalette();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: steps.length, now: current + 1 }}
      style={{ gap: tokens.space[2] }}
    >
      <View style={{ flexDirection: 'row', gap: tokens.space[1] }}>
        {steps.map((s, i) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 6,
              borderRadius: tokens.radius.pill,
              backgroundColor: i <= current ? c.primary : c.line,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.space[1] }}>
        {steps.map((s, i) => (
          <AppText
            key={s}
            variant="micro"
            tone={i === current ? 'default' : 'muted'}
            style={{ flex: 1, fontWeight: i === current ? '800' : '600' }}
          >
            {s}
          </AppText>
        ))}
      </View>
    </View>
  );
}
