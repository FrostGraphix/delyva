import type { MenuItem, VendorDetail } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { CaretLeftIcon, ClockIcon, ShoppingBagIcon, StorefrontIcon } from '@delyva/icons/native';
import { useVendor } from '@delyva/sdk';
import { AppText, Button, Card, Chip, IconButton, StateView, usePalette } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api/client';
import { errorMessage } from '../../src/api/query-client';
import { CategoryGlyph, categoryLabel } from '../../src/components/category';
import { type ItemChoice, ItemSheet } from '../../src/components/item-sheet';
import { QueryBoundary } from '../../src/components/query-boundary';
import { goBack, Screen } from '../../src/components/screen';
import { haptic } from '../../src/device/haptics';
import { formatMinor } from '../../src/features/money';
import { useAddToCart, useCartCount } from '../../src/hooks/use-cart';
import { t } from '../../src/i18n';

function ItemRow({
  item,
  onPress,
}: {
  readonly item: MenuItem;
  readonly onPress: () => void;
}): ReactElement {
  return (
    <Card
      onPress={item.available ? onPress : undefined}
      accessibilityLabel={t('menu.add', { name: item.name })}
      testID={`item-${item.id}`}
      style={{ flexDirection: 'row', gap: tokens.space[3], opacity: item.available ? 1 : 0.5 }}
    >
      <View style={{ flex: 1, gap: tokens.space[1] }}>
        <AppText style={{ fontWeight: '700' }}>{item.name}</AppText>
        {item.description ? (
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {item.description}
          </AppText>
        ) : null}
        <AppText style={{ fontWeight: '700' }} numeric>
          {item.available ? formatMinor(item.price.amountMinor) : t('menu.soldOut')}
        </AppText>
      </View>
    </Card>
  );
}

function Menu({
  vendor,
  branchId,
  eta,
}: {
  readonly vendor: VendorDetail;
  readonly branchId: string;
  readonly eta: string | undefined;
}): ReactElement {
  const c = usePalette();
  const branch = vendor.branches.find((b) => b.id === branchId) ?? vendor.branches[0];
  const cats = [...vendor.menu.categories].sort((a, b) => a.position - b.position);
  const [catId, setCatId] = useState<string | null>(null);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { add, pending } = useAddToCart();
  const onAdd = async (choice: ItemChoice): Promise<void> => {
    if (!branch) return;
    setError(null);
    try {
      await add({
        vendorId: vendor.id,
        vendorName: vendor.name,
        branchId: branch.id,
        itemId: choice.item.id,
        name: choice.item.name,
        optionIds: choice.optionIds,
        optionNames: choice.optionNames,
        quantity: choice.quantity,
        unitPreviewMinor: choice.unitPreviewMinor,
      });
      haptic('addToCart');
      setItem(null);
    } catch (e) {
      setError(errorMessage(e, t('cart.updateError')));
    }
  };
  const shown = catId ? cats.filter((x) => x.id === catId) : cats;
  return (
    <>
      <View style={{ gap: tokens.space[2] }}>
        <AppText variant="h1">{vendor.name}</AppText>
        <AppText tone="muted">{categoryLabel(vendor.category)}</AppText>
        <View style={{ flexDirection: 'row', gap: tokens.space[2], flexWrap: 'wrap' }}>
          {eta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[1] }}>
              <ClockIcon size={16} color={c.text} />
              <AppText variant="caption" numeric>
                {t('vendor.eta', { min: eta })}
              </AppText>
            </View>
          ) : null}
          <AppText variant="caption" tone={branch?.isOpenNow ? 'accent' : 'danger'} style={{ alignSelf: 'center', fontWeight: '700' }}>
            {branch?.isOpenNow ? t('menu.open') : t('menu.closed')}
          </AppText>
        </View>
        {vendor.description ? <AppText tone="muted">{vendor.description}</AppText> : null}
      </View>
      {cats.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
          {cats.map((x) => (
            <Chip
              key={x.id}
              label={x.name}
              selected={catId === x.id}
              onPress={() => {
                setCatId(catId === x.id ? null : x.id);
              }}
            />
          ))}
        </View>
      ) : null}
      {cats.length === 0 ? (
        <StateView title={t('menu.emptyTitle')} message={t('menu.emptyBody')} illustration={<StorefrontIcon size={32} color={tokens.color.ink[900]} />} />
      ) : (
        shown.map((x) => (
          <View key={x.id} style={{ gap: tokens.space[2] }}>
            <AppText variant="h3">{x.name}</AppText>
            {x.items.map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                onPress={() => {
                  setItem(i);
                }}
              />
            ))}
          </View>
        ))
      )}
      {error ? (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <ItemSheet
        item={item}
        adding={pending}
        onClose={() => {
          setItem(null);
        }}
        onAdd={(choice) => {
          void onAdd(choice);
        }}
      />
    </>
  );
}

/** C11 Merchant page: hero, info, category chips, dishes and the item sheet (C12). */
export default function VendorScreen(): ReactElement {
  const c = usePalette();
  const { id, branchId, eta } = useLocalSearchParams<{ id: string; branchId?: string; eta?: string }>();
  const vendor = useVendor(api, id);
  const count = useCartCount();
  return (
    <Screen
      testID="vendor"
      footer={
        count > 0 ? (
          <Button
            label={t('menu.viewCart', { count })}
            variant="ink"
            size="lg"
            onPress={() => {
              router.push('/cart');
            }}
          />
        ) : undefined
      }
    >
      <View
        style={{
          height: 140,
          marginHorizontal: -tokens.space[4],
          marginTop: -tokens.space[4],
          backgroundColor: tokens.color.mint[200],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {vendor.data ? <CategoryGlyph category={vendor.data.category} size={32} color={tokens.color.ink[900]} /> : <ShoppingBagIcon size={32} color={tokens.color.ink[900]} />}
        <View style={{ position: 'absolute', top: tokens.space[3], left: tokens.space[4] }}>
          <IconButton variant="glass" icon={<CaretLeftIcon color={c.text} />} accessibilityLabel={t('common.back')} onPress={goBack} testID="back" />
        </View>
      </View>
      <QueryBoundary query={vendor} skeletonRows={5}>
        {(v) => <Menu vendor={v} branchId={branchId ?? ''} eta={eta} />}
      </QueryBoundary>
    </Screen>
  );
}
