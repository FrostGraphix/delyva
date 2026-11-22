import type { Cart } from '@delyva/contracts';
import { MAX_LINE_QUANTITY } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { MinusIcon, PlusIcon, ShoppingBagIcon, TrashIcon } from '@delyva/icons/native';
import {
  AppText,
  Button,
  Card,
  IconButton,
  PriceRow,
  QuantityStepper,
  StateView,
  usePalette,
} from '@delyva/ui-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { errorMessage } from '../../src/api/query-client';
import { useSession } from '../../src/auth/session-store';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { formatMinor, formatMoney } from '../../src/features/money';
import { useEditServerLine, useServerCarts } from '../../src/hooks/use-cart';
import { t } from '../../src/i18n';
import { type GuestLine, useGuestCart } from '../../src/state/guest-cart-store';

interface LineProps {
  readonly name: string;
  readonly options: readonly string[];
  readonly quantity: number;
  readonly total: string;
  readonly problem?: string | null;
  readonly onQuantity: (q: number) => void;
  readonly testID: string;
}

function Line({
  name,
  options,
  quantity,
  total,
  problem,
  onQuantity,
  testID,
}: LineProps): ReactElement {
  const c = usePalette();
  return (
    <View testID={testID} style={{ gap: tokens.space[2], paddingVertical: tokens.space[2] }}>
      <View style={{ flexDirection: 'row', gap: tokens.space[2] }}>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '700' }}>{name}</AppText>
          {options.length > 0 ? (
            <AppText variant="caption" tone="muted">
              {options.join(', ')}
            </AppText>
          ) : null}
        </View>
        <AppText numeric style={{ fontWeight: '700' }}>
          {total}
        </AppText>
      </View>
      {problem ? (
        <AppText variant="caption" tone="danger">
          {t('cart.problem', { problem })}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <QuantityStepper
          testID={`${testID}-qty`}
          value={quantity}
          max={MAX_LINE_QUANTITY}
          onChange={onQuantity}
          decrementLabel={t('item.decrease')}
          incrementLabel={t('item.increase')}
          decrementIcon={<MinusIcon size={20} color={c.text} />}
          incrementIcon={<PlusIcon size={20} color={c.text} />}
        />
        <IconButton
          icon={<TrashIcon size={20} color={c.danger} />}
          accessibilityLabel={t('cart.remove', { name })}
          onPress={() => {
            onQuantity(0);
          }}
        />
      </View>
    </View>
  );
}

function Empty(): ReactElement {
  return (
    <StateView
      testID="cart-empty"
      illustration={<ShoppingBagIcon size={32} color={tokens.color.ink[900]} />}
      title={t('cart.emptyTitle')}
      message={t('cart.emptyBody')}
      actionLabel={t('cart.emptyAction')}
      onAction={() => {
        router.navigate('/home');
      }}
    />
  );
}

function GuestCart({ lines }: { readonly lines: readonly GuestLine[] }): ReactElement {
  const setQuantity = useGuestCart((s) => s.setQuantity);
  const remove = useGuestCart((s) => s.remove);
  const subtotal = lines.reduce((n, l) => n + l.unitPreviewMinor * l.quantity, 0);
  return (
    <Card>
      <AppText variant="h3">{lines[0]?.vendorName ?? ''}</AppText>
      {lines.map((l) => (
        <Line
          key={l.key}
          testID={`line-${l.itemId}`}
          name={l.name}
          options={l.optionNames}
          quantity={l.quantity}
          total={formatMinor(l.unitPreviewMinor * l.quantity)}
          onQuantity={(q) => {
            if (q <= 0) remove(l.key);
            else setQuantity(l.key, q);
          }}
        />
      ))}
      <PriceRow label={t('cart.subtotal')} value={formatMinor(subtotal)} emphasis />
      <AppText variant="caption" tone="muted">
        {t('cart.estimateNote')}
      </AppText>
    </Card>
  );
}

function ServerCart({ cart }: { readonly cart: Cart }): ReactElement {
  const edit = useEditServerLine();
  return (
    <Card testID={`cart-${cart.id}`}>
      {cart.lines.map((l) => (
        <Line
          key={l.id}
          testID={`line-${l.itemId}`}
          name={l.name}
          options={l.options.map((o) => o.name)}
          quantity={l.quantity}
          total={formatMoney(l.lineTotal)}
          problem={l.problem}
          onQuantity={(quantity) => {
            edit.mutate({ cartId: cart.id, lineId: l.id, quantity });
          }}
        />
      ))}
      <PriceRow
        label={t('cart.subtotal')}
        value={formatMoney(cart.itemsSubtotal)}
        emphasis
        testID="cart-subtotal"
      />
      <AppText variant="caption" tone="muted">
        {t('cart.estimateNote')}
      </AppText>
      {edit.isError ? (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {errorMessage(edit.error, t('cart.updateError'))}
        </AppText>
      ) : null}
      <View style={{ marginTop: tokens.space[3] }}>
        <Button
          label={t('cart.checkout')}
          size="lg"
          disabled={!cart.checkoutReady || cart.lines.length === 0}
          onPress={() => {
            router.push({ pathname: '/checkout/[cartId]', params: { cartId: cart.id } });
          }}
        />
      </View>
    </Card>
  );
}

/** C14 Cart: guest cart (local) or server carts with optimistic edits. */
export default function CartScreen(): ReactElement {
  const authed = useSession((s) => s.status === 'authed');
  const guest = useGuestCart((s) => s.lines);
  const carts = useServerCarts();
  if (!authed) {
    return (
      <Screen
        title={t('cart.title')}
        tabBarInset
        testID="cart"
        footer={
          guest.length > 0 ? (
            <Button
              label={t('cart.signInToCheckout')}
              size="lg"
              onPress={() => {
                router.push({ pathname: '/login', params: { redirect: '/cart' } });
              }}
            />
          ) : undefined
        }
      >
        {guest.length === 0 ? <Empty /> : <GuestCart lines={guest} />}
      </Screen>
    );
  }
  return (
    <Screen
      title={t('cart.title')}
      tabBarInset
      testID="cart"
      onRefresh={() => {
        void carts.refetch();
      }}
      refreshing={carts.isRefetching}
    >
      <QueryBoundary query={carts} skeletonRows={2} skeletonHeight={160}>
        {(data) => {
          const nonEmpty = data.items.filter((x) => x.lines.length > 0);
          return nonEmpty.length === 0 ? (
            <Empty />
          ) : (
            <View style={{ gap: tokens.space[3] }}>
              {nonEmpty.map((x) => (
                <ServerCart key={x.id} cart={x} />
              ))}
            </View>
          );
        }}
      </QueryBoundary>
    </Screen>
  );
}
