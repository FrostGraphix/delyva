import { tokens } from '@delyva/design-tokens';
import {
  HouseIcon,
  type IconProps,
  MagnifyingGlassIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  UserIcon,
} from '@delyva/icons/native';
import { AppText, GlassSurface, usePalette } from '@delyva/ui-native';
import { type Href, router, type Tabs } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartCount } from '../hooks/use-cart';
import { t, type MessageKey } from '../i18n';

/** Props expo-router passes to a custom tab bar. */
export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: MessageKey; Icon: (p: IconProps) => ReactElement }> = {
  home: { label: 'tabs.home', Icon: HouseIcon },
  search: { label: 'tabs.search', Icon: MagnifyingGlassIcon },
  cart: { label: 'tabs.cart', Icon: ShoppingBagIcon },
  orders: { label: 'tabs.orders', Icon: ReceiptIcon },
  profile: { label: 'tabs.profile', Icon: UserIcon },
};

/** Floating glass tab bar (docs/07 §13): active tab in an ink lens, cart as the lime centre action. */
export function GlassTabBar({ state }: TabBarProps): ReactElement {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const count = useCartCount();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: tokens.space[4],
        right: tokens.space[4],
        bottom: Math.max(insets.bottom, tokens.space[3]),
      }}
    >
      <GlassSurface style={{ flexDirection: 'row', padding: tokens.space[2], alignItems: 'center' }}>
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === i;
          const centre = route.name === 'cart';
          const label = t(tab.label);
          const fg = centre ? c.onPrimary : focused ? c.onButtonInk : c.text;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={centre && count > 0 ? `${label}, ${String(count)}` : label}
              accessibilityState={{ selected: focused }}
              testID={`tab-${route.name}`}
              onPress={() => {
                if (!focused) router.navigate(`/${route.name}` as Href);
              }}
              style={{
                flex: 1,
                minHeight: 56,
                borderRadius: tokens.radius['2xl'],
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: centre ? c.primary : focused ? c.buttonInk : 'transparent',
                marginHorizontal: centre ? tokens.space[1] : 0,
              }}
            >
              <tab.Icon size={24} color={fg} />
              <AppText variant="micro" style={{ color: fg }}>
                {centre && count > 0 ? `${label} · ${String(count)}` : label}
              </AppText>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}
