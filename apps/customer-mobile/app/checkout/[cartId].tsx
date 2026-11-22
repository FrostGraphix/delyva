import type { Cart, PaymentMethod, QuoteRequest, VendorDetail } from '@delyva/contracts';
import { PromoCodeInputSchema } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { MapPinIcon, TagIcon } from '@delyva/icons/native';
import { useCheckout, useCreateAddress, useVendor, useWallet } from '@delyva/sdk';
import {
  AppText,
  Button,
  Card,
  ChoiceRow,
  SkeletonList,
  StateView,
  TextField,
  usePalette,
} from '@delyva/ui-native';
import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, ordering } from '../../src/api/client';
import { errorMessage } from '../../src/api/query-client';
import { PriceBreakdown } from '../../src/components/price-breakdown';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { config } from '../../src/config';
import { track } from '../../src/device/analytics';
import { quoteRows } from '../../src/features/breakdown';
import { formatMinor, formatMoney } from '../../src/features/money';
import { useServerCarts } from '../../src/hooks/use-cart';
import { t, type MessageKey } from '../../src/i18n';
import { type DeliveryAddress, usePrefs } from '../../src/state/prefs-store';

const METHODS: readonly { id: PaymentMethod; label: MessageKey }[] = [
  { id: 'wallet', label: 'checkout.method.wallet' },
  { id: 'card', label: 'checkout.method.card' },
  { id: 'transfer', label: 'checkout.method.transfer' },
];

/** Saves the device address on the server once (checkout needs an address id). */
function useSavedAddress(): { address: DeliveryAddress | null; error: unknown } {
  const address = usePrefs((s) => s.address);
  const setAddress = usePrefs((s) => s.setAddress);
  const create = useCreateAddress(api);
  const key = useMemo(() => randomUUID(), []);
  useEffect(() => {
    if (!address || address.savedId || create.isPending || create.isError) return;
    const { savedId: _s, landmark, ...rest } = address;
    create.mutate(
      { ...rest, ...(landmark ? { landmark } : {}), idempotencyKey: key },
      {
        onSuccess: (a) => {
          setAddress({ ...address, savedId: a.id });
        },
      },
    );
  }, [address, create, key, setAddress]);
  return { address, error: create.error };
}

function quoteRequest(
  cart: Cart,
  vendor: VendorDetail,
  a: DeliveryAddress,
  promo: string | null,
): QuoteRequest | null {
  const branch = vendor.branches.find((b) => b.id === cart.branchId);
  if (!branch) return null;
  return {
    zoneCode: config.pricingZoneCode,
    pickup: { lat: branch.lat, lng: branch.lng },
    dropoff: { lat: a.lat, lng: a.lng },
    lines: cart.lines.map((l) => {
      const deltas = l.options.map((o) => o.priceDelta.amountMinor);
      return {
        unitPriceMinor: l.unitPrice.amountMinor - deltas.reduce((s, d) => s + d, 0),
        quantity: l.quantity,
        modifierDeltasMinor: deltas,
      };
    }),
    ...(promo ? { promoCode: promo } : {}),
  };
}

function Checkout({ cart, address }: { readonly cart: Cart; readonly address: DeliveryAddress }): ReactElement {
  const c = usePalette();
  const vendor = useVendor(api, cart.vendorId);
  const wallet = useWallet(api);
  const checkout = useCheckout(ordering);
  const [method, setMethod] = useState<PaymentMethod>('wallet');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  const req = vendor.data ? quoteRequest(cart, vendor.data, address, promo) : null;
  const quote = useQuery({
    queryKey: ['pricing', 'quote', cart.id, cart.version, address.lat, address.lng, promo],
    queryFn: () => {
      if (!req) throw new Error('no quote request');
      return api.createQuote(req);
    },
    enabled: req !== null,
    staleTime: 60_000,
  });
  const total = quote.data?.totalMinor ?? 0;
  const available = wallet.data?.available.amountMinor ?? 0;
  const walletLow = method === 'wallet' && wallet.data !== undefined && available < total;
  const promoState = quote.data?.promo ?? null;
  const promoValid = PromoCodeInputSchema.safeParse(promoInput).success;
  const idemKey = useMemo(
    () => randomUUID(),
    // A new attempt (new key) whenever what is being bought changes; retries reuse the key.
    [cart.version, method, promo, address.savedId],
  );
  const pay = (): void => {
    if (!address.savedId) return;
    checkout.mutate(
      {
        cartId: cart.id,
        addressId: address.savedId,
        paymentMethod: method,
        ...(promo && promoState?.applied ? { promoCode: promo } : {}),
        idempotencyKey: idemKey,
      },
      {
        onSuccess: (order) => {
          track({ name: 'order_placed', method });
          void (async () => {
            if (order.status === 'PENDING_PAYMENT' && order.payment.authorizationUrl) {
              await WebBrowser.openBrowserAsync(order.payment.authorizationUrl).catch(() => undefined);
              router.replace({ pathname: '/payment/[orderId]', params: { orderId: order.id } });
              return;
            }
            router.replace({ pathname: '/placed/[id]', params: { id: order.id } });
          })();
        },
      },
    );
  };
  return (
    <Screen
      title={t('checkout.title')}
      back
      testID="checkout"
      footer={
        <View style={{ gap: tokens.space[2] }}>
          {checkout.isError ? (
            <AppText tone="danger" accessibilityLiveRegion="polite" testID="checkout-error">
              {t('checkout.orderError', { message: errorMessage(checkout.error, t('common.errorBody')) })}
            </AppText>
          ) : null}
          <Button
            label={quote.data ? t('checkout.pay', { amount: formatMinor(total) }) : t('common.loading')}
            size="lg"
            variant="ink"
            loading={checkout.isPending}
            disabled={!quote.data || walletLow || !address.savedId}
            onPress={pay}
          />
        </View>
      }
    >
      <Card>
        <AppText variant="caption" tone="muted">
          {t('checkout.deliverTo')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: tokens.space[2], alignItems: 'center', marginTop: tokens.space[1] }}>
          <MapPinIcon size={20} color={c.accentText} />
          <View style={{ flex: 1 }}>
            <AppText style={{ fontWeight: '700' }}>{address.line1}</AppText>
            {address.landmark ? (
              <AppText variant="caption" tone="muted">
                {address.landmark}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => {
              router.push('/addresses');
            }}
          >
            <AppText tone="accent" style={{ fontWeight: '700' }}>
              {t('checkout.changeAddress')}
            </AppText>
          </Pressable>
        </View>
      </Card>
      <View style={{ gap: tokens.space[2] }}>
        <AppText variant="h3">{t('checkout.payment')}</AppText>
        {METHODS.map((m) => (
          <ChoiceRow
            key={m.id}
            testID={`method-${m.id}`}
            kind="radio"
            label={t(m.label)}
            detail={
              m.id === 'wallet' && wallet.data
                ? t('checkout.method.walletBalance', { amount: formatMoney(wallet.data.available) })
                : undefined
            }
            selected={method === m.id}
            onPress={() => {
              setMethod(m.id);
            }}
          />
        ))}
        {walletLow ? (
          <View style={{ gap: tokens.space[2] }}>
            <AppText tone="danger">{t('checkout.walletLow')}</AppText>
            <Button
              label={t('checkout.topUp')}
              variant="soft"
              size="sm"
              onPress={() => {
                router.push('/wallet');
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={{ gap: tokens.space[2] }}>
        <AppText variant="h3">{t('checkout.promo')}</AppText>
        <View style={{ flexDirection: 'row', gap: tokens.space[2], alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={t('checkout.promo')}
              hideLabel
              placeholder={t('checkout.promoPlaceholder')}
              value={promoInput}
              autoCapitalize="characters"
              onChangeText={setPromoInput}
              testID="promo-input"
              leading={<TagIcon size={20} color={c.textMuted} />}
            />
          </View>
          <Button
            label={promo ? t('checkout.removePromo') : t('checkout.applyPromo')}
            variant="soft"
            disabled={!promo && !promoValid}
            onPress={() => {
              if (promo) {
                setPromo(null);
                setPromoInput('');
              } else setPromo(promoInput.trim().toUpperCase());
            }}
          />
        </View>
        {promoState ? (
          <AppText tone={promoState.applied ? 'accent' : 'danger'} accessibilityLiveRegion="polite" testID="promo-status">
            {promoState.applied
              ? t('checkout.promoApplied', { code: promoState.code })
              : t('checkout.promoRejected', {
                  code: promoState.code,
                  reason: t(`promo.reason.${promoState.reason ?? 'not_found'}`),
                })}
          </AppText>
        ) : null}
      </View>
      <Card>
        <AppText variant="h3" style={{ marginBottom: tokens.space[2] }}>
          {t('checkout.summary')}
        </AppText>
        <QueryBoundary query={quote} skeletonRows={4} skeletonHeight={20}>
          {(q) => <PriceBreakdown rows={quoteRows(q)} />}
        </QueryBoundary>
      </Card>
    </Screen>
  );
}

/** C15/C16 Checkout: address, payment method, promo and the server-priced breakdown before Pay. */
export default function CheckoutScreen(): ReactElement {
  const { cartId } = useLocalSearchParams<{ cartId: string }>();
  const carts = useServerCarts();
  const { address, error } = useSavedAddress();
  if (error) {
    return (
      <Screen title={t('checkout.title')} back>
        <StateView tone="error" title={t('common.errorTitle')} message={errorMessage(error, t('address.saveError'))} />
      </Screen>
    );
  }
  const cart = carts.data?.items.find((x) => x.id === cartId);
  if (!carts.data || !address?.savedId) {
    return (
      <Screen title={t('checkout.title')} back>
        <SkeletonList rows={4} label={t('common.loading')} />
      </Screen>
    );
  }
  if (!cart) {
    return (
      <Screen title={t('checkout.title')} back>
        <StateView
          title={t('checkout.noCart')}
          actionLabel={t('cart.emptyAction')}
          onAction={() => {
            router.replace('/home');
          }}
        />
      </Screen>
    );
  }
  return <Checkout cart={cart} address={address} />;
}
