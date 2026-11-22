import { tokens } from '@delyva/design-tokens';
import { ClockIcon, CreditCardIcon, ScooterIcon } from '@delyva/icons/native';
import { AppText, Button, usePalette } from '@delyva/ui-native';
import { router } from 'expo-router';
import {
  type ComponentRef,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { track } from '../src/device/analytics';
import { t, type MessageKey } from '../src/i18n';
import { usePrefs } from '../src/state/prefs-store';

interface Slide {
  readonly title: MessageKey;
  readonly body: MessageKey;
  readonly icon: (color: string) => ReactNode;
}

const SLIDES: readonly Slide[] = [
  {
    title: 'welcome.slide1.title',
    body: 'welcome.slide1.body',
    icon: (c) => <ScooterIcon size={32} color={c} />,
  },
  {
    title: 'welcome.slide2.title',
    body: 'welcome.slide2.body',
    icon: (c) => <ClockIcon size={32} color={c} />,
  },
  {
    title: 'welcome.slide3.title',
    body: 'welcome.slide3.body',
    icon: (c) => <CreditCardIcon size={32} color={c} />,
  },
];

/** C02: up to 3 swipeable, skippable value screens. */
export default function Welcome(): ReactElement {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const complete = usePrefs((s) => s.completeOnboarding);
  useEffect(() => {
    track({ name: 'onboarding_step_viewed', step: `welcome_${String(index + 1)}` });
  }, [index]);
  const finish = (): void => {
    complete();
    track({ name: 'onboarding_step_completed', step: 'welcome' });
    router.replace('/location');
  };
  const last = index === SLIDES.length - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} testID="welcome">
      <View style={{ alignItems: 'flex-end', paddingHorizontal: tokens.space[4] }}>
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          testID="welcome-skip"
          style={{
            minHeight: tokens.touchTarget,
            justifyContent: 'center',
            paddingHorizontal: tokens.space[2],
          }}
        >
          <AppText tone="accent" style={{ fontWeight: '700' }}>
            {t('welcome.skip')}
          </AppText>
        </Pressable>
      </View>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
      >
        {SLIDES.map((s, i) => (
          <View
            key={s.title}
            accessibilityLabel={t('welcome.slideLabel', { index: i + 1, total: SLIDES.length })}
            style={{
              width,
              padding: tokens.space[6],
              justifyContent: 'center',
              gap: tokens.space[4],
            }}
          >
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: tokens.radius['3xl'],
                backgroundColor: c.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {s.icon(c.onPrimary)}
            </View>
            <AppText variant="display">{t(s.title)}</AppText>
            <AppText variant="bodyL" tone="muted">
              {t(s.body)}
            </AppText>
          </View>
        ))}
      </ScrollView>
      <View style={{ padding: tokens.space[4], gap: tokens.space[4] }}>
        <View
          style={{ flexDirection: 'row', gap: tokens.space[2], justifyContent: 'center' }}
          importantForAccessibility="no-hide-descendants"
        >
          {SLIDES.map((s, i) => (
            <View
              key={s.title}
              style={{
                width: i === index ? 24 : 8,
                height: 8,
                borderRadius: tokens.radius.pill,
                backgroundColor: i === index ? c.buttonInk : c.line,
              }}
            />
          ))}
        </View>
        <Button
          label={last ? t('welcome.start') : t('welcome.next')}
          size="lg"
          onPress={() => {
            if (last) {
              finish();
              return;
            }
            const next = index + 1;
            ref.current?.scrollTo({ x: next * width, animated: true });
            setIndex(next);
          }}
        />
      </View>
    </SafeAreaView>
  );
}
