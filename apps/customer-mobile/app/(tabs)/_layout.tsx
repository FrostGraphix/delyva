import { Tabs } from 'expo-router';
import type { ReactElement } from 'react';
import { GlassTabBar } from '../../src/components/glass-tab-bar';

/** Bottom tabs with the floating glass tab bar (cart as the centre action). */
export default function TabsLayout(): ReactElement {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <GlassTabBar {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
