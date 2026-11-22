import type { Order } from '@delyva/contracts';
import { orderingKeys, useCancelOrder, useOrder } from '@delyva/sdk';
import { tokens } from '@delyva/design-tokens';
import { AppText, BottomSheet, Button, Card } from '@delyva/ui-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ordering } from '../../src/api/client';
import { errorMessage } from '../../src/api/query-client';
import { PriceBreakdown } from '../../src/components/price-breakdown';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { orderRows } from '../../src/features/breakdown';
import { formatMoney } from '../../src/features/money';
import { canCustomerCancel, isActiveOrder, statusKey } from '../../src/features/tracking';
import { t, type MessageKey } from '../../src/i18n';

const METHOD_KEY: Record<Order['payment']['method'], MessageKey> = {
  wallet: 'checkout.method.wallet',
  card: 'checkout.method.card',
  transfer: 'checkout.method.transfer',
};

function Detail({ order }: { readonly order: Order }): ReactElement {
  const qc = useQueryClient();
  const cancel = useCancelOrder(ordering);
  const cancelKey = useMemo(() => randomUUID(), []);
  const reorder = useMutation({
    mutationFn: () => ordering.reorder(order.id, randomUUID()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: orderingKeys.carts() });
      router.navigate('/cart');
    },
  });
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Card>
        <AppText variant="h3" testID="order-status">
          {t(statusKey(order.status))}
        </AppText>
        <AppText variant="caption" tone="muted">
          {`${order.vendorName} · ${new Date(order.createdAt).toLocaleString('en-NG')}`}
        </AppText>
      </Card>
      <Card>
        <AppText variant="h3">{t('order.items')}</AppText>
        {order.items.map((i) => (
          <View key={`${i.itemId}-${i.options.map((o) => o.id).join()}`} style={{ flexDirection: 'row', paddingVertical: tokens.space[2], gap: tokens.space[2] }}>
            <View style={{ flex: 1 }}>
              <AppText>{`${String(i.quantity)} × ${i.name}`}</AppText>
              {i.options.length > 0 ? (
                <AppText variant="caption" tone="muted">
                  {i.options.map((o) => o.name).join(', ')}
                </AppText>
              ) : null}
            </View>
            <AppText numeric>{formatMoney(i.lineTotal)}</AppText>
          </View>
        ))}
      </Card>
      <Card>
        <AppText variant="h3" style={{ marginBottom: tokens.space[2] }}>
          {t('order.receipt')}
        </AppText>
        <PriceBreakdown rows={orderRows(order.totals)} />
        <AppText variant="caption" tone="muted" style={{ marginTop: tokens.space[2] }}>
          {t('order.paidWith', { method: t(METHOD_KEY[order.payment.method]) })}
        </AppText>
      </Card>
      <Card>
        <AppText variant="h3">{t('order.timeline')}</AppText>
        {order.timeline.map((e) => (
          <View key={`${e.status}-${e.at}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: tokens.space[1] }}>
            <AppText variant="caption">{t(statusKey(e.status))}</AppText>
            <AppText variant="caption" tone="muted" numeric>
              {new Date(e.at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
            </AppText>
          </View>
        ))}
      </Card>
      {isActiveOrder(order.status) ? (
        <Button
          label={t('order.track')}
          variant="ink"
          onPress={() => {
            router.push({ pathname: '/track/[id]', params: { id: order.id } });
          }}
        />
      ) : null}
      <Button label={t('order.reorder')} variant="brand" loading={reorder.isPending} onPress={() => { reorder.mutate(); }} />
      {reorder.isError ? <AppText tone="danger">{errorMessage(reorder.error, t('common.errorBody'))}</AppText> : null}
      {canCustomerCancel(order.status) ? (
        <Button label={t('order.cancel')} variant="danger" onPress={() => { setConfirm(true); }} />
      ) : null}
      {cancel.isError ? (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {t('order.cancelError', { message: errorMessage(cancel.error, t('common.errorBody')) })}
        </AppText>
      ) : null}
      <BottomSheet
        visible={confirm}
        onClose={() => { setConfirm(false); }}
        closeLabel={t('common.close')}
        footer={
          <View style={{ gap: tokens.space[2] }}>
            <Button
              label={t('order.cancelConfirm')}
              variant="danger"
              size="lg"
              loading={cancel.isPending}
              onPress={() => {
                cancel.mutate(
                  { id: order.id, idempotencyKey: cancelKey },
                  {
                    onSuccess: (o) => {
                      qc.setQueryData(orderingKeys.order(o.id), o);
                      void qc.invalidateQueries({ queryKey: orderingKeys.all });
                    },
                    onSettled: () => { setConfirm(false); },
                  },
                );
              }}
            />
            <Button label={t('order.cancelKeep')} variant="ghost" onPress={() => { setConfirm(false); }} />
          </View>
        }
      >
        <AppText variant="h2">{t('order.cancelTitle')}</AppText>
        <AppText tone="muted">{t('order.cancelBody')}</AppText>
      </BottomSheet>
    </>
  );
}

/** C30 Order detail & receipt: items, totals, timeline, reorder and cancel (when allowed). */
export default function OrderScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(ordering, id, 30_000);
  return (
    <Screen title={order.data ? t('order.title', { ref: order.data.ref }) : undefined} back testID="order-detail">
      <QueryBoundary query={order}>{(o) => <Detail order={o} />}</QueryBoundary>
    </Screen>
  );
}
