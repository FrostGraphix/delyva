import { tokens } from '@delyva/design-tokens';
import { BellIcon, CaretRightIcon, type IconProps, MapPinIcon, UserIcon, WalletIcon } from '@delyva/icons/native';
import { AppText, Button, Card, usePalette } from '@delyva/ui-native';
import { useMutation } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../../src/api/client';
import { queryClient } from '../../src/api/query-client';
import { closeRealtime } from '../../src/api/realtime';
import { useSession } from '../../src/auth/session-store';
import { Screen } from '../../src/components/screen';
import { t, type MessageKey } from '../../src/i18n';
import { usePrefs } from '../../src/state/prefs-store';

const LINKS: readonly { label: MessageKey; href: Href; Icon: (p: IconProps) => ReactElement }[] = [
  { label: 'profile.addresses', href: '/addresses', Icon: MapPinIcon },
  { label: 'profile.wallet', href: '/wallet', Icon: WalletIcon },
  { label: 'profile.inbox', href: '/inbox', Icon: BellIcon },
];

/** C31 Profile: name, links (addresses, wallet, inbox) and sign out. */
export default function Profile(): ReactElement {
  const c = usePalette();
  const authed = useSession((s) => s.status === 'authed');
  const firstName = usePrefs((s) => s.firstName);
  const signOut = useMutation({
    mutationFn: async () => {
      const { refreshToken } = useSession.getState();
      // Revoke server-side first; sign out locally even if the network call fails.
      if (refreshToken) await api.logout({ refreshToken }).catch(() => undefined);
      closeRealtime();
      await useSession.getState().clear();
      usePrefs.getState().resetAccountData();
      queryClient.clear();
    },
  });
  return (
    <Screen title={t('profile.title')} tabBarInset testID="profile">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] }}>
        <View style={{ width: 56, height: 56, borderRadius: tokens.radius.pill, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <UserIcon color={c.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="h2" testID="profile-name">{firstName ?? t('profile.guest')}</AppText>
          <AppText variant="caption" tone="muted">{authed ? t('profile.signedIn') : t('profile.signedOut')}</AppText>
        </View>
      </Card>
      {authed ? (
        <>
          <Card padded={false}>
            {LINKS.map((l, i) => (
              <Pressable
                key={l.label}
                accessibilityRole="button"
                testID={`profile-${l.label}`}
                onPress={() => { router.push(l.href); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], minHeight: 56, paddingHorizontal: tokens.space[4], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}
              >
                <l.Icon size={24} color={c.text} />
                <AppText style={{ flex: 1, fontWeight: '600' }}>{t(l.label)}</AppText>
                <CaretRightIcon size={20} color={c.textMuted} />
              </Pressable>
            ))}
          </Card>
          <Button label={t('profile.signOut')} variant="ghost" loading={signOut.isPending} onPress={() => { signOut.mutate(); }} accessibilityLabel={t('profile.signOut')} />
        </>
      ) : (
        <Button label={t('common.signIn')} onPress={() => { router.push({ pathname: '/login', params: { redirect: '/profile' } }); }} />
      )}
    </Screen>
  );
}
