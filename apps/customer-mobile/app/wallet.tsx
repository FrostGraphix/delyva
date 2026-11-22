import type { PaymentIntent, WalletTransaction } from '@delyva/contracts';
import { MAX_TOP_UP_MINOR, MIN_TOP_UP_MINOR } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { WalletIcon } from '@delyva/icons/native';
import {
  paymentsKeys,
  useCreateWalletTopUp,
  useVerifyPaymentIntent,
  useWallet,
  useWalletTransactions,
} from '@delyva/sdk';
import { AppText, Button, Card, Chip, ChoiceRow, StateView, TextField } from '@delyva/ui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { type ReactElement, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { errorMessage } from '../src/api/query-client';
import { QueryBoundary } from '../src/components/query-boundary';
import { Screen } from '../src/components/screen';
import { PAYMENT_POLL_MS, TOP_UP_PRESETS_MINOR } from '../src/config';
import { formatMinor, formatMoney, nairaInputToMinor } from '../src/features/money';
import { t, type MessageKey } from '../src/i18n';

function kindKey(kind: string): MessageKey {
  if (kind === 'top_up' || kind === 'order_hold') return `wallet.kind.${kind}`;
  return 'wallet.kind.other';
}

function TxRow({ tx }: { readonly tx: WalletTransaction }): ReactElement {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: tokens.space[2] }} testID="wallet-tx">
      <View>
        <AppText style={{ fontWeight: '600' }}>{t(kindKey(tx.kind))}</AppText>
        <AppText variant="caption" tone="muted">
          {new Date(tx.createdAt).toLocaleString('en-NG')}
        </AppText>
      </View>
      <AppText numeric tone={tx.amount.amountMinor > 0 ? 'accent' : 'default'} style={{ fontWeight: '700' }}>
        {formatMoney(tx.amount)}
      </AppText>
    </View>
  );
}

/** Polls a pending top-up intent until the server settles it. */
function usePendingIntent(intent: PaymentIntent | null): PaymentIntent | null {
  const q = useQuery({
    queryKey: paymentsKeys.intent(intent?.id ?? 'none'),
    queryFn: () => api.getPaymentIntent(intent?.id ?? ''),
    enabled: intent !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'succeeded' || query.state.data?.status === 'failed' ? false : PAYMENT_POLL_MS,
  });
  return q.data ?? intent;
}

function TopUp(): ReactElement {
  const qc = useQueryClient();
  const create = useCreateWalletTopUp(api);
  const verify = useVerifyPaymentIntent(api);
  const [amount, setAmount] = useState<number>(TOP_UP_PRESETS_MINOR[0] ?? MIN_TOP_UP_MINOR);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const live = usePendingIntent(intent);
  const chosen = custom ? nairaInputToMinor(custom) : amount;
  const valid = chosen !== null && chosen >= MIN_TOP_UP_MINOR && chosen <= MAX_TOP_UP_MINOR;
  useEffect(() => {
    if (live?.status === 'succeeded') void qc.invalidateQueries({ queryKey: paymentsKeys.wallet() });
  }, [live?.status, qc]);
  const start = (): void => {
    if (!valid) return;
    create.mutate(
      { amountMinor: chosen, method, idempotencyKey: randomUUID() },
      {
        onSuccess: (pi) => {
          setIntent(pi);
          if (pi.authorizationUrl) void WebBrowser.openBrowserAsync(pi.authorizationUrl).catch(() => undefined);
        },
      },
    );
  };
  return (
    <Card testID="topup">
      <AppText variant="h3">{t('wallet.topUp')}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2], marginVertical: tokens.space[3] }}>
        {TOP_UP_PRESETS_MINOR.map((p) => (
          <Chip key={p} label={formatMinor(p)} testID={`topup-${String(p)}`} selected={!custom && amount === p} onPress={() => { setCustom(''); setAmount(p); }} />
        ))}
      </View>
      <TextField label={t('wallet.custom')} value={custom} onChangeText={setCustom} keyboardType="number-pad" testID="topup-custom"
        error={custom && !valid ? t('wallet.amountError', { min: formatMinor(MIN_TOP_UP_MINOR), max: formatMinor(MAX_TOP_UP_MINOR) }) : null} />
      <View style={{ gap: tokens.space[2], marginTop: tokens.space[3] }}>
        <AppText variant="caption" tone="muted">{t('wallet.method')}</AppText>
        <ChoiceRow kind="radio" label={t('checkout.method.card')} selected={method === 'card'} onPress={() => { setMethod('card'); }} />
        <ChoiceRow kind="radio" label={t('checkout.method.transfer')} selected={method === 'transfer'} onPress={() => { setMethod('transfer'); }} />
      </View>
      <View style={{ marginTop: tokens.space[3], gap: tokens.space[2] }}>
        {live?.status === 'requires_action' || live?.status === 'processing' ? (
          <>
            <AppText tone="muted" accessibilityLiveRegion="polite" testID="topup-pending">{t('wallet.topUpPending')}</AppText>
            <Button label={t('payment.check')} variant="soft" loading={verify.isPending} onPress={() => { verify.mutate({ id: live.id }, { onSuccess: () => void qc.invalidateQueries({ queryKey: paymentsKeys.intent(live.id) }) }); }} />
          </>
        ) : null}
        {live?.status === 'succeeded' ? <AppText tone="accent" testID="topup-done" accessibilityLiveRegion="polite">{t('wallet.topUpDone')}</AppText> : null}
        {live?.status === 'failed' ? <AppText tone="danger">{t('wallet.topUpFailed')}</AppText> : null}
        {create.isError ? <AppText tone="danger">{errorMessage(create.error, t('common.errorBody'))}</AppText> : null}
        <Button label={t('wallet.topUpAction', { amount: valid ? formatMinor(chosen) : '' })} size="lg" disabled={!valid} loading={create.isPending} onPress={start} />
      </View>
    </Card>
  );
}

/** C32 Wallet: balance, top-up (card/transfer via provider) and transactions. */
export default function WalletScreen(): ReactElement {
  const wallet = useWallet(api);
  const txs = useWalletTransactions(api);
  return (
    <Screen title={t('wallet.title')} back testID="wallet" onRefresh={() => { void wallet.refetch(); void txs.refetch(); }} refreshing={wallet.isRefetching}>
      <QueryBoundary query={wallet} skeletonRows={1}>
        {(w) => (
          <Card style={{ backgroundColor: tokens.color.ink[900], borderColor: tokens.color.ink[900] }}>
            <AppText variant="caption" tone="inverse">{t('wallet.balance')}</AppText>
            <AppText variant="display" numeric testID="wallet-balance" style={{ color: tokens.color.neutral[0] }}>
              {formatMoney(w.available)}
            </AppText>
            {w.held.amountMinor > 0 ? <AppText variant="caption" tone="inverse">{t('wallet.held', { amount: formatMoney(w.held) })}</AppText> : null}
          </Card>
        )}
      </QueryBoundary>
      <TopUp />
      <AppText variant="h3">{t('wallet.transactions')}</AppText>
      <QueryBoundary query={txs} skeletonRows={3} skeletonHeight={48}>
        {(page) =>
          page.items.length === 0 ? (
            <StateView illustration={<WalletIcon size={32} color={tokens.color.ink[900]} />} title={t('wallet.emptyTitle')} message={t('wallet.emptyBody')} />
          ) : (
            <Card>{page.items.map((x) => <TxRow key={x.id} tx={x} />)}</Card>
          )
        }
      </QueryBoundary>
    </Screen>
  );
}
