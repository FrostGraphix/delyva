import { tokens } from '@delyva/design-tokens';
import { BellIcon, CheckCircleIcon } from '@delyva/icons/native';
import { useOrder } from '@delyva/sdk';
import { AppText, Button, Card, useReduceMotion, usePalette } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { ordering } from '../../src/api/client';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { haptic } from '../../src/device/haptics';
import { enablePush, type PushOutcome } from '../../src/device/push';
import { t } from '../../src/i18n';
import { usePrefs } from '../../src/state/prefs-store';

function Celebrate(): ReactElement {
  const c = usePalette();
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(reduce ? 1 : 0.6)).current;
  useEffect(() => {
    haptic('orderPlaced');
    if (reduce) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start();
  }, [reduce, scale]);
  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        alignSelf: 'center',
        width: 112,
        height: 112,
        borderRadius: tokens.radius.pill,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CheckCircleIcon size={32} color={c.onPrimary} />
    </Animated.View>
  );
}

/** Asks for notification permission after the first order (CLAUDE.md onboarding step 5). */
function NotifyCard(): ReactElement | null {
  const c = usePalette();
  const asked = usePrefs((s) => s.notificationsAsked);
  const markAsked = usePrefs((s) => s.markNotificationsAsked);
  const [outcome, setOutcome] = useState<PushOutcome | null>(null);
  if (asked && outcome === null) return null;
  return (
    <Card testID="notify-card">
      <View style={{ flexDirection: 'row', gap: tokens.space[3], alignItems: 'center' }}>
        <BellIcon size={24} color={c.accentText} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3">{t('placed.notifyTitle')}</AppText>
          <AppText tone="muted">{outcome === 'granted' ? t('placed.notifyDone') : t('placed.notifyBody')}</AppText>
        </View>
      </View>
      {outcome === null ? (
        <View style={{ marginTop: tokens.space[3] }}>
          <Button
            label={t('placed.notifyAction')}
            variant="soft"
            onPress={() => {
              markAsked();
              enablePush()
                .then(setOutcome)
                .catch(() => {
                  setOutcome('denied');
                });
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

/** C18 Order placed: animated check, reference, notification ask and "Track order". */
export default function Placed(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(ordering, id);
  return (
    <Screen
      testID="placed"
      footer={
        <Button
          label={t('placed.track')}
          size="lg"
          variant="ink"
          onPress={() => {
            router.replace({ pathname: '/track/[id]', params: { id } });
          }}
        />
      }
    >
      <QueryBoundary query={order} skeletonRows={2}>
        {(o) => (
          <View style={{ gap: tokens.space[4], paddingTop: tokens.space[8] }}>
            <Celebrate />
            <AppText variant="display" align="center">
              {t('placed.title')}
            </AppText>
            <AppText tone="muted" align="center">
              {t('placed.body', { vendor: o.vendorName })}
            </AppText>
            <AppText align="center" style={{ fontWeight: '700' }} testID="placed-ref">
              {t('placed.ref', { ref: o.ref })}
            </AppText>
            <NotifyCard />
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
