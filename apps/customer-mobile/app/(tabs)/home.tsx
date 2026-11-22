import type { VendorCategory } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import {
  BasketIcon,
  BellIcon,
  CaretDownIcon,
  ForkKnifeIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PackageIcon,
  PillIcon,
  StorefrontIcon,
  TagIcon,
} from '@delyva/icons/native';
import { useDiscoverVendors } from '@delyva/sdk';
import { AppText, Card, IconButton, StateView, usePalette } from '@delyva/ui-native';
import { router } from 'expo-router';
import { type ReactElement, type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../../src/api/client';
import { useSession } from '../../src/auth/session-store';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { VendorCard } from '../../src/components/vendor-card';
import { t, type MessageKey } from '../../src/i18n';
import { usePrefs } from '../../src/state/prefs-store';

type Service = 'food' | 'groceries' | 'pharmacy' | 'parcels';

const SERVICES: readonly { id: Service; label: MessageKey; category: VendorCategory | null }[] = [
  { id: 'food', label: 'home.category.food', category: 'restaurant' },
  { id: 'groceries', label: 'home.category.groceries', category: 'grocery' },
  { id: 'pharmacy', label: 'home.category.pharmacy', category: 'pharmacy' },
  { id: 'parcels', label: 'home.category.parcels', category: null },
];

function serviceIcon(id: Service, color: string): ReactNode {
  const p = { size: 24 as const, color };
  if (id === 'food') return <ForkKnifeIcon {...p} />;
  if (id === 'groceries') return <BasketIcon {...p} />;
  if (id === 'pharmacy') return <PillIcon {...p} />;
  return <PackageIcon {...p} />;
}

/** C08 Home: address, greeting, search, service tiles, promo banner and open vendors. */
export default function Home(): ReactElement {
  const c = usePalette();
  const address = usePrefs((s) => s.address);
  const firstName = usePrefs((s) => s.firstName);
  const authed = useSession((s) => s.status === 'authed');
  const [service, setService] = useState<Service | null>(null);
  const category = SERVICES.find((s) => s.id === service)?.category ?? undefined;
  const query = address
    ? { lat: address.lat, lng: address.lng, ...(category ? { category } : {}) }
    : null;
  const vendors = useDiscoverVendors(api, service === 'parcels' ? null : query);
  return (
    <Screen
      tabBarInset
      testID="home"
      onRefresh={() => {
        void vendors.refetch();
      }}
      refreshing={vendors.isRefetching}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.changeAddress', { address: address?.line1 ?? '' })}
          onPress={() => {
            router.push('/address');
          }}
          testID="home-address"
          style={{ flex: 1, minHeight: tokens.touchTarget, justifyContent: 'center' }}
        >
          <AppText variant="micro" tone="muted">
            {t('home.deliverTo').toUpperCase()}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[1] }}>
            <MapPinIcon size={16} color={c.accentText} />
            <AppText style={{ fontWeight: '700' }} numberOfLines={1}>
              {address?.line1 ?? ''}
            </AppText>
            <CaretDownIcon size={16} color={c.text} />
          </View>
        </Pressable>
        <IconButton
          icon={<BellIcon color={c.text} />}
          accessibilityLabel={t('home.inbox')}
          testID="home-inbox"
          onPress={() => {
            router.push(authed ? '/inbox' : { pathname: '/login', params: { redirect: '/inbox' } });
          }}
        />
      </View>
      <View>
        <AppText variant="h1">
          {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingGuest')}
        </AppText>
        <AppText variant="h1" tone="muted">
          {t('home.subtitle')}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={t('home.searchPlaceholder')}
        onPress={() => {
          router.navigate('/search');
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space[2],
          minHeight: 52,
          paddingHorizontal: tokens.space[4],
          borderRadius: tokens.radius.pill,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.line,
        }}
      >
        <MagnifyingGlassIcon size={20} color={c.textMuted} />
        <AppText tone="muted">{t('home.searchPlaceholder')}</AppText>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: tokens.space[2] }}>
        {SERVICES.map((s) => {
          const on = service === s.id;
          const fg = on ? c.onButtonInk : c.text;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(s.label)}
              testID={`service-${s.id}`}
              onPress={() => {
                setService(on ? null : s.id);
              }}
              style={{
                flex: 1,
                minHeight: 72,
                borderRadius: tokens.radius.xl,
                alignItems: 'center',
                justifyContent: 'center',
                gap: tokens.space[1],
                backgroundColor: on ? c.buttonInk : c.surface,
                borderWidth: 1,
                borderColor: on ? c.buttonInk : c.line,
              }}
            >
              {serviceIcon(s.id, fg)}
              <AppText variant="caption" style={{ color: fg, fontWeight: '700' }}>
                {t(s.label)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View
        accessible
        accessibilityLabel={`${t('home.promoTitle')}. ${t('home.promoBody')}`}
        style={{
          borderRadius: tokens.radius['2xl'],
          padding: tokens.space[5],
          backgroundColor: c.primary,
          flexDirection: 'row',
          gap: tokens.space[3],
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, gap: tokens.space[1] }}>
          <AppText variant="h2" tone="onPrimary">
            {t('home.promoTitle')}
          </AppText>
          <AppText tone="onPrimary">{t('home.promoBody')}</AppText>
        </View>
        <TagIcon size={32} color={c.onPrimary} />
      </View>
      {service === 'parcels' ? (
        <Card>
          <StateView
            illustration={<PackageIcon size={32} color={tokens.color.ink[900]} />}
            title={t('home.parcelsTitle')}
            message={t('home.parcelsBody')}
          />
        </Card>
      ) : (
        <>
          <AppText variant="h3">{t('home.nearby')}</AppText>
          <QueryBoundary query={vendors} skeletonRows={3} skeletonHeight={200}>
            {(data) =>
              data.items.length === 0 ? (
                <StateView
                  testID="home-empty"
                  illustration={<StorefrontIcon size={32} color={tokens.color.ink[900]} />}
                  title={t('home.emptyTitle')}
                  message={t('home.emptyBody')}
                  actionLabel={t('home.emptyAction')}
                  onAction={() => {
                    router.push('/address');
                  }}
                />
              ) : (
                <View style={{ gap: tokens.space[3] }}>
                  {data.items.map((v) => (
                    <VendorCard
                      key={v.id}
                      vendor={v}
                      onPress={() => {
                        router.push({
                          pathname: '/vendor/[id]',
                          params: { id: v.id, branchId: v.branchId, eta: String(v.etaMinutes) },
                        });
                      }}
                    />
                  ))}
                </View>
              )
            }
          </QueryBoundary>
        </>
      )}
    </Screen>
  );
}
