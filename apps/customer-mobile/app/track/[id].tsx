import type { Order } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { ChatIcon, PhoneIcon, ScooterIcon } from '@delyva/icons/native';
import { useOrder, useVendor } from '@delyva/sdk';
import { AppText, Button, Card, IconButton, ProgressSteps, usePalette } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { api, ordering } from '../../src/api/client';
import { useOrderLive } from '../../src/api/realtime';
import { OrderMap } from '../../src/components/order-map';
import { QueryBoundary } from '../../src/components/query-boundary';
import { Screen } from '../../src/components/screen';
import { ORDER_POLL_CONNECTED_MS, ORDER_POLL_FALLBACK_MS } from '../../src/config';
import { haptic } from '../../src/device/haptics';
import {
  showsDeliveryOtp,
  statusKey,
  TRACKING_STEPS,
  trackingStep,
} from '../../src/features/tracking';
import { t } from '../../src/i18n';
import { usePrefs } from '../../src/state/prefs-store';

function RiderCard({ order }: { readonly order: Order }): ReactElement {
  const c = usePalette();
  return (
    <Card testID="rider-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.color.mint[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ScooterIcon color={tokens.color.ink[900]} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" tone="muted">
            {t('track.rider')}
          </AppText>
          {/* DEBT(contracts): Order.rider has only an id — no rider name/photo/vehicle/rating in contracts — add a rider summary to OrderSchema. */}
          <AppText style={{ fontWeight: '700' }}>
            {order.rider ? t('track.riderAssigned') : t('track.riderPending')}
          </AppText>
        </View>
        {/* DEBT(engagement): call/chat disabled — masked relay calling and chat not built — enable via the voice provider in Phase 2. */}
        <IconButton
          icon={<PhoneIcon color={c.textDisabled} />}
          accessibilityLabel={`${t('track.call')}. ${t('track.contactSoon')}`}
          onPress={() => undefined}
        />
        <IconButton
          icon={<ChatIcon color={c.textDisabled} />}
          accessibilityLabel={`${t('track.chat')}. ${t('track.contactSoon')}`}
          onPress={() => undefined}
        />
      </View>
    </Card>
  );
}

function Tracking({
  order,
  connected,
  rider,
}: {
  readonly order: Order;
  readonly connected: boolean;
  readonly rider: { lat: number; lng: number } | null;
}): ReactElement {
  const c = usePalette();
  const address = usePrefs((s) => s.address);
  const vendor = useVendor(api, order.vendorId);
  const branch = vendor.data?.branches.find((b) => b.id === order.branchId) ?? null;
  const step = trackingStep(order.status);
  const steps = TRACKING_STEPS.map((k) => t(k));
  const stepLabel = steps[Math.max(step, 0)] ?? '';
  const prev = useRef(order.status);
  useEffect(() => {
    if (prev.current !== 'DELIVERED' && order.status === 'DELIVERED') haptic('delivered');
    prev.current = order.status;
  }, [order.status]);
  return (
    <>
      {/* Location sharing stops once delivered (CLAUDE.md data protection). */}
      <OrderMap
        pickup={branch ? { lat: branch.lat, lng: branch.lng } : null}
        dropoff={address ? { lat: address.lat, lng: address.lng } : null}
        rider={order.status === 'DELIVERED' ? null : rider}
      />
      <Card>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1, gap: tokens.space[1] }}>
            <AppText variant="h2" testID="track-status" accessibilityLiveRegion="polite">
              {t(statusKey(order.status))}
            </AppText>
            <AppText variant="caption" tone="muted">
              {order.vendorName} · {order.ref}
            </AppText>
          </View>
          {step >= 0 && step < 4 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="h1" numeric testID="track-eta">
                {t('track.eta', { min: order.etaMinutes })}
              </AppText>
              <AppText variant="micro" tone="muted">
                {t('track.etaLabel')}
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={{ marginTop: tokens.space[4] }}>
          <ProgressSteps
            steps={steps}
            current={step}
            accessibilityLabel={t('track.stepLabel', {
              index: step + 1,
              total: steps.length,
              label: stepLabel,
            })}
          />
        </View>
        <AppText
          variant="micro"
          tone={connected ? 'accent' : 'muted'}
          style={{ marginTop: tokens.space[3] }}
          testID="track-mode"
        >
          {connected ? t('track.live') : t('track.polling')}
        </AppText>
      </Card>
      {showsDeliveryOtp(order.status) && order.deliveryOtp ? (
        <Card testID="delivery-otp">
          <AppText variant="caption" tone="muted">
            {t('track.otp')}
          </AppText>
          <AppText variant="display" numeric style={{ letterSpacing: 8, color: c.text }}>
            {order.deliveryOtp}
          </AppText>
          <AppText variant="caption" tone="muted">
            {t('track.otpHint')}
          </AppText>
        </Card>
      ) : null}
      <RiderCard order={order} />
      <Button
        label={t('track.details')}
        variant="ghost"
        onPress={() => {
          router.push({ pathname: '/order/[id]', params: { id: order.id } });
        }}
      />
    </>
  );
}

/** C20/C21 Live tracking: map, 5-step bar, ETA, rider card; socket with 10 s polling fallback. */
export default function TrackScreen(): ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const live = useOrderLive(id);
  const order = useOrder(
    ordering,
    id,
    live.connected ? ORDER_POLL_CONNECTED_MS : ORDER_POLL_FALLBACK_MS,
  );
  return (
    <Screen
      title={t('track.title')}
      back
      testID="track"
      onRefresh={() => {
        void order.refetch();
      }}
      refreshing={order.isRefetching}
    >
      <QueryBoundary query={order} skeletonRows={3} skeletonHeight={140}>
        {(o) => <Tracking order={o} connected={live.connected} rider={live.riderLocation} />}
      </QueryBoundary>
    </Screen>
  );
}
