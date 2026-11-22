import { tokens } from '@delyva/design-tokens';
import { MapPinIcon, TrashIcon } from '@delyva/icons/native';
import { useAddresses, useDeleteAddress } from '@delyva/sdk';
import { AppText, Button, Card, IconButton, StateView, usePalette } from '@delyva/ui-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { QueryBoundary } from '../src/components/query-boundary';
import { goBack, Screen } from '../src/components/screen';
import { t } from '../src/i18n';
import { usePrefs } from '../src/state/prefs-store';

/** C33 Saved addresses: choose the delivery address, add or delete. */
export default function Addresses(): ReactElement {
  const c = usePalette();
  const list = useAddresses(api);
  const del = useDeleteAddress(api);
  const current = usePrefs((s) => s.address);
  const setAddress = usePrefs((s) => s.setAddress);
  return (
    <Screen
      title={t('addresses.title')}
      back
      testID="addresses"
      footer={<Button label={t('addresses.add')} size="lg" onPress={() => { router.push({ pathname: '/address', params: { mode: 'add' } }); }} />}
    >
      <QueryBoundary query={list}>
        {(page) =>
          page.items.length === 0 ? (
            <StateView illustration={<MapPinIcon size={32} color={tokens.color.ink[900]} />} title={t('addresses.emptyTitle')} message={t('addresses.emptyBody')} />
          ) : (
            <View style={{ gap: tokens.space[3] }}>
              {page.items.map((a) => {
                const isCurrent = current?.savedId === a.id;
                return (
                  <Card
                    key={a.id}
                    testID="address-row"
                    accessibilityLabel={t('addresses.use', { label: a.label })}
                    onPress={() => {
                      setAddress({ label: a.label, line1: a.line1, landmark: a.landmark, lat: a.lat, lng: a.lng, savedId: a.id });
                      goBack();
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], borderColor: isCurrent ? c.primary : c.line }}
                  >
                    <MapPinIcon color={isCurrent ? c.accentText : c.text} />
                    <View style={{ flex: 1 }}>
                      <AppText style={{ fontWeight: '700' }}>{isCurrent ? `${a.label} · ${t('addresses.current')}` : a.label}</AppText>
                      <AppText variant="caption" tone="muted">{a.line1}</AppText>
                    </View>
                    {isCurrent ? null : (
                      <IconButton
                        icon={<TrashIcon size={20} color={c.danger} />}
                        accessibilityLabel={t('addresses.delete', { label: a.label })}
                        onPress={() => { del.mutate({ addressId: a.id }); }}
                      />
                    )}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
