import { tokens } from '@delyva/design-tokens';
import { type ReactElement, useEffect, useRef } from 'react';
import { Animated, type DimensionValue, View } from 'react-native';
import { usePalette } from './theme.js';
import { useReduceMotion } from './use-reduce-motion.js';

/** Skeleton props. */
export interface SkeletonProps {
  readonly width?: DimensionValue;
  readonly height?: number;
  readonly radius?: number;
}

/** Loading placeholder block with a soft pulse (static when reduce-motion is on). */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = tokens.radius.md,
}: SkeletonProps): ReactElement {
  const c = usePalette();
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const half = tokens.motion.duration.page * 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: half, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 1, duration: half, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, reduce]);
  return (
    <Animated.View style={{ opacity }}>
      <View style={{ width, height, borderRadius: radius, backgroundColor: c.line }} />
    </Animated.View>
  );
}

/** SkeletonList props. */
export interface SkeletonListProps {
  readonly rows?: number;
  /** Announced to screen readers while loading. */
  readonly label: string;
  readonly rowHeight?: number;
}

/** A stack of card-shaped skeletons for list screens; announced as busy. */
export function SkeletonList({ rows = 4, label, rowHeight = 88 }: SkeletonListProps): ReactElement {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID="skeleton-list"
      style={{ gap: tokens.space[3] }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={rowHeight} radius={tokens.radius.xl} />
      ))}
    </View>
  );
}
