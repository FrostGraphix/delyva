import { tokens } from '@delyva/design-tokens';
import type { ReactElement, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { GlassSurface } from './glass-surface.js';
import { withAlpha } from './glass-styles.js';
import { usePalette } from './theme.js';
import { useReduceMotion } from './use-reduce-motion.js';

/** BottomSheet props. */
export interface BottomSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Label for the backdrop "close" control. */
  readonly closeLabel: string;
  readonly children: ReactNode;
  /** Sticky footer (the sheet's one primary action), kept in the thumb zone. */
  readonly footer?: ReactNode;
  readonly testID?: string;
}

/** Modal glass sheet with a scrim; content scrolls, footer stays pinned. */
export function BottomSheet({
  visible,
  onClose,
  closeLabel,
  children,
  footer,
  testID,
}: BottomSheetProps): ReactElement {
  const c = usePalette();
  const reduce = useReduceMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduce ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: withAlpha(tokens.color.ink[900], 0.35),
          }}
        />
        <GlassSurface
          radius={tokens.radius['2xl']}
          testID={testID}
          style={{
            maxHeight: '88%',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            paddingTop: tokens.space[2],
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: tokens.radius.pill,
              backgroundColor: c.line,
              marginBottom: tokens.space[2],
            }}
          />
          <ScrollView
            contentContainerStyle={{ padding: tokens.space[4], gap: tokens.space[3] }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ padding: tokens.space[4], paddingTop: tokens.space[2] }}>{footer}</View>
          ) : null}
        </GlassSurface>
      </View>
    </Modal>
  );
}
