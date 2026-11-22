import { tokens } from '@delyva/design-tokens';
import { HouseIcon, UserIcon, WalletIcon, WarningIcon } from '@delyva/icons/native';
import { useThemeColors } from '@delyva/ui-native';
import { type Href, router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type MessageKey, t } from '../i18n';

type Tab = 'home' | 'earnings' | 'profile' | 'issue';

const TABS: readonly { id: Tab; href: Href; label: MessageKey; Icon: typeof HouseIcon }[] = [
  { id: 'home', href: '/home', label: 'nav.home', Icon: HouseIcon },
  { id: 'earnings', href: '/earnings', label: 'nav.earnings', Icon: WalletIcon },
  { id: 'profile', href: '/profile', label: 'nav.profile', Icon: UserIcon },
  { id: 'issue', href: '/issue', label: 'nav.issue', Icon: WarningIcon },
];

/** Bottom navigation for the rider shell; active tab is shown by colour AND weight. */
export function RiderNav({ active }: { active: Tab }): ReactElement {
  const c = useThemeColors();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      {TABS.map(({ id, href, label, Icon }) => {
        const on = id === active;
        return (
          <Pressable
            key={id}
            testID={`nav-${id}`}
            accessibilityRole="tab"
            accessibilityLabel={t(label)}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) router.replace(href);
            }}
            style={{
              flex: 1,
              minHeight: tokens.space[14],
              alignItems: 'center',
              justifyContent: 'center',
              gap: tokens.space[1],
            }}
          >
            <Icon size={24} color={on ? c.accentText : c.textMuted} />
            <Text
              style={{
                color: on ? c.text : c.textMuted,
                fontSize: tokens.type.caption.size,
                fontWeight: on ? '800' : '500',
              }}
            >
              {t(label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
