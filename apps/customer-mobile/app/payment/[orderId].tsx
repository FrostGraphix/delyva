import { tokens } from '@delyva/design-tokens';
import { CreditCardIcon, WarningIcon } from '@delyva/icons/native';
import { useOrder, useVerifyPaymentIntent } from '@delyva/sdk';
import { AppText, Button, StateView, usePalette } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactElement, useEffect } from 'react';
import { View } from 'react-native';
import { api, ordering } from '../../src/api/client';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { PAYMENT_POLL_MS } from '../../src/config';
import { formatMoney } from '../../src/features/money';
import { t } from '../../src/i18n';

/**
 * C17 Waiting for a card/transfer payment. The order only moves when the server confirms the
 * charge (verified webhook or server verify), never because the browser came back.
 */
export default function PaymentScreen(): ReactElement {
  const c = usePalette();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useOrder(ordering, orderId, PAYMENT_POLL_MS);
  const verify = useVerifyPaymentIntent(api);
  const status = order.data?.status;
  useEffect(() => {
    if (status && status !== 'PENDING_PAYMENT' && status !== 'PAYMENT_FAILED') {
      router.replace({ pathname: '/placed/[id]', params: { id: orderId } });
    }
  }, [status, orderId]);
  return (
    <Screen title={t('payment.title')} back testID="payment">
      <QueryBoundary query={order} skeletonRows={2}>
        {(o) =>
          o.status === 'PAYMENT_FAILED' ? (
            <StateView
              tone="error"
              testID="payment-failed"
              illustration={<WarningIcon size={32} color={c.danger} />}
              title={t('payment.failedTitle')}
              message={t('payment.failedBody')}
              actionLabel={t('payment.backToCart')}
              onAction={() => {
                router.replace('/cart');
              }}
            />
          ) : (
            <View style={{ gap: tokens.space[4] }}>
              <StateView
                illustration={<CreditCardIcon size={32} color={tokens.color.ink[900]} />}
                title={formatMoney(o.totals.total)}
                message={t('payment.body')}
              />
              <AppText align="center" tone="muted" accessibilityLiveRegion="polite">
                {t('payment.waiting')}
              </AppText>
              <Button
                label={t('payment.check')}
                size="lg"
                loading={verify.isPending}
                disabled={!o.payment.intentId}
                onPress={() => {
                  if (!o.payment.intentId) return;
                  verify.mutate(
                    { id: o.payment.intentId },
                    { onSettled: () => void order.refetch() },
                  );
                }}
              />
              {o.payment.authorizationUrl ? (
                <Button
                  label={t('payment.reopen')}
                  variant="ghost"
                  onPress={() => {
                    if (o.payment.authorizationUrl) {
                      void WebBrowser.openBrowserAsync(o.payment.authorizationUrl).catch(() => undefined);
                    }
                  }}
                />
              ) : null}
            </View>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
