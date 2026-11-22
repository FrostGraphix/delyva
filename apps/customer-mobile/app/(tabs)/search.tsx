import { tokens } from '@delyva/design-tokens';
import { ClockIcon, MagnifyingGlassIcon } from '@delyva/icons/native';
import { useDiscoverVendors } from '@delyva/sdk';
import { AppText, Chip, StateView, TextField, usePalette } from '@delyva/ui-native';
import { router } from 'expo-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../../src/api/client';
import { categoryLabel } from '../../src/components/category';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { VendorCard } from '../../src/components/vendor-card';
import { filterVendors } from '../../src/features/search';
import { t } from '../../src/i18n';
import { usePrefs } from '../../src/state/prefs-store';

/** C09 Search: recent searches + client-side filter of open vendors for the address. */
export default function Search(): ReactElement {
  const c = usePalette();
  const address = usePrefs((s) => s.address);
  const recent = usePrefs((s) => s.recentSearches);
  const addRecent = usePrefs((s) => s.addRecentSearch);
  const clearRecent = usePrefs((s) => s.clearRecentSearches);
  const [q, setQ] = useState('');
  const vendors = useDiscoverVendors(api, address ? { lat: address.lat, lng: address.lng } : null);
  const results = useMemo(
    () => filterVendors(vendors.data?.items ?? [], q, categoryLabel),
    [vendors.data, q],
  );
  return (
    <Screen title={t('search.title')} tabBarInset testID="search">
      <TextField
        label={t('search.placeholder')}
        hideLabel
        placeholder={t('search.placeholder')}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => {
          addRecent(q);
        }}
        returnKeyType="search"
        autoFocus
        testID="search-input"
        leading={<MagnifyingGlassIcon size={20} color={c.textMuted} />}
      />
      {q.trim().length === 0 ? (
        recent.length === 0 ? (
          <AppText tone="muted">{t('search.hint')}</AppText>
        ) : (
          <View style={{ gap: tokens.space[2] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="micro" tone="muted">
                {t('search.recent').toUpperCase()}
              </AppText>
              <Pressable accessibilityRole="button" onPress={clearRecent} hitSlop={12}>
                <AppText variant="caption" tone="accent">
                  {t('search.clearRecent')}
                </AppText>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
              {recent.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  accessibilityLabel={t('search.recentLabel', { query: r })}
                  icon={<ClockIcon size={16} color={c.textMuted} />}
                  onPress={() => {
                    setQ(r);
                  }}
                />
              ))}
            </View>
          </View>
        )
      ) : (
        <QueryBoundary query={vendors} skeletonRows={3}>
          {() =>
            results.length === 0 ? (
              <StateView
                testID="search-empty"
                illustration={<MagnifyingGlassIcon size={32} color={tokens.color.ink[900]} />}
                title={t('search.emptyTitle')}
                message={t('search.emptyBody')}
              />
            ) : (
              <View style={{ gap: tokens.space[3] }}>
                <AppText variant="micro" tone="muted">
                  {t('search.results').toUpperCase()}
                </AppText>
                {results.map((v) => (
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    onPress={() => {
                      addRecent(q);
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
      )}
    </Screen>
  );
}
