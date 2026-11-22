import type { OrderSummary } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { ReceiptIcon } from '@delyva/icons/native';
import { useMyOrders } from '@delyva/sdk';
import { AppText, Button, Card, StateView } from '@delyva/ui-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { ordering } from '../../src/api/client';
import { useSession } from '../../src/auth/session-store';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { formatMoney } from '../../src/features/money';
import { isActiveOrder, statusKey } from '../../src/features/tracking';
import { t } from '../../src/i18n';

function Row({ o }: { readonly o: OrderSummary }): ReactElement {
  const status = t(statusKey(o.status));
  const total = formatMoney(o.total);
  return (
    <Card
      testID={`order-${o.id}`}
      accessibilityLabel={t('orders.rowLabel', { vendor: o.vendorName, status, total })}
      onPress={() => {
        router.push({
          pathname: isActiveOrder(o.status) ? '/track/[id]' : '/order/[id]',
          params: { id: o.id },
        });
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space[2] }}>
        <View style={{ flex: 1, gap: tokens.space[1] }}>
          <AppText style={{ fontWeight: '700' }}>{o.vendorName}</AppText>
          <AppText variant="caption" tone="muted">
            {`${o.ref} · ${t('orders.itemCount', { count: o.itemCount })}`}
          </AppText>
          <AppText variant="caption" tone={isActiveOrder(o.status) ? 'accent' : 'muted'}>
            {status}
          </AppText>
        </View>
        <AppText numeric style={{ fontWeight: '700' }}>
          {total}
        </AppText>
      </View>
    </Card>
  );
}

function Signed(): ReactElement {
  const orders = useMyOrders(ordering);
  return (
    <QueryBoundary query={orders}>
      {(page) => {
        if (page.items.length === 0) {
          return (
            <StateView
              testID="orders-empty"
              illustration={<ReceiptIcon size={32} color={tokens.color.ink[900]} />}
              title={t('orders.emptyTitle')}
              message={t('orders.emptyBody')}
              actionLabel={t('orders.emptyAction')}
              onAction={() => {
                router.navigate('/home');
              }}
            />
          );
        }
        const active = page.items.filter((o) => isActiveOrder(o.status));
        const past = page.items.filter((o) => !isActiveOrder(o.status));
        return (
          <View style={{ gap: tokens.space[3] }}>
            {active.length > 0 ? <AppText variant="h3">{t('orders.active')}</AppText> : null}
            {active.map((o) => (
              <Row key={o.id} o={o} />
            ))}
            {past.length > 0 ? <AppText variant="h3">{t('orders.past')}</AppText> : null}
            {past.map((o) => (
              <Row key={o.id} o={o} />
            ))}
          </View>
        );
      }}
    </QueryBoundary>
  );
}

/** C29 Orders: active and past orders. */
export default function Orders(): ReactElement {
  const authed = useSession((s) => s.status === 'authed');
  return (
    <Screen title={t('orders.title')} tabBarInset testID="orders">
      {authed ? (
        <Signed />
      ) : (
        <StateView
          illustration={<ReceiptIcon size={32} color={tokens.color.ink[900]} />}
          title={t('common.signInRequired')}
          message={t('orders.emptyBody')}
        />
      )}
      {authed ? null : (
        <Button
          label={t('common.signIn')}
          onPress={() => {
            router.push({ pathname: '/login', params: { redirect: '/orders' } });
          }}
        />
      )}
    </Screen>
  );
}
