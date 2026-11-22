import type { Trip, TripStatus } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { NavigationArrowIcon } from '@delyva/icons/native';
import { useMyCurrentTrip } from '@delyva/sdk';
import {
  RiderBanner,
  Button,
  RiderCard,
  CodeInput,
  RiderStateMessage,
  RiderTextField,
  Typography,
  useThemeColors,
} from '@delyva/ui-native';
import { router } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { t } from '../src/i18n';
import { openMaps } from '../src/trip/open-maps';
import { isFinal, stageFor } from '../src/trip/trip-stage';
import { type TripActionRunner, useTripActionRunner } from '../src/trip/use-trip-action';
import { QueryView } from '../src/ui/query-view';
import { Screen } from '../src/ui/screen';

const CODE_LENGTH = 4;

/** 5-step progress bar; the current step is also stated in text. */
function Progress({ step }: { step: number }): ReactElement {
  const c = useThemeColors();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${String(step)} / 5`}
      style={{ flexDirection: 'row', gap: tokens.space[1] }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={{
            flex: 1,
            height: tokens.space[2],
            borderRadius: tokens.radius.pill,
            backgroundColor: n <= step ? c.primary : c.line,
          }}
        />
      ))}
    </View>
  );
}

/** Undeliverable report: reason + one action. */
function Undeliverable({ trip, runner }: { trip: Trip; runner: TripActionRunner }): ReactElement {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open)
    return (
      <Button
        label={t('trip.undeliverable')}
        variant="ghost"
        size="md"
        onPress={() => {
          setOpen(true);
        }}
      />
    );
  return (
    <RiderCard testID="undeliverable-form">
      <RiderTextField
        testID="undeliverable-reason"
        label={t('trip.undeliverableReason')}
        value={reason}
        onChangeText={setReason}
      />
      <Button
        label={t('trip.reportUndeliverable')}
        variant="danger"
        size="lg"
        disabled={reason.trim().length < 3 || runner.busy}
        onPress={() => {
          runner.run(trip, 'undeliverable', { reason: reason.trim() });
        }}
      />
    </RiderCard>
  );
}

/** Body of the trip screen for one stage. */
function TripStageView({
  trip,
  status,
  runner,
}: {
  trip: Trip;
  status: TripStatus;
  runner: TripActionRunner;
}): ReactElement {
  const c = useThemeColors();
  const stage = stageFor(status);
  const [code, setCode] = useState('');
  const target = stage.target === 'pickup' ? trip.pickup : trip.dropoff;
  const act = (): void => {
    if (stage.action === 'arrived-at-vendor')
      runner.run(trip, 'arrived-at-vendor', { pickupCode: code });
    else if (stage.action === 'delivered') runner.run(trip, 'delivered', { deliveryOtp: code });
    else if (stage.action === 'picked-up' || stage.action === 'arrived-at-customer')
      runner.run(trip, stage.action, {});
  };
  return (
    <>
      <Progress step={stage.step} />
      <Typography variant="h1" header testID="trip-stage">
        {t(stage.title)}
      </Typography>
      {runner.queued ? <RiderBanner tone="info" testID="trip-queued" text={t('trip.queued')} /> : null}
      {runner.error ? <RiderBanner tone="danger" testID="trip-error" text={runner.error} /> : null}
      {stage.target ? (
        <Button
          label={t('trip.navigate')}
          variant="soft"
          size="lg"
          onPress={() => {
            void openMaps(target);
          }}
        />
      ) : null}
      {stage.code ? (
        <RiderCard>
          <NavigationArrowIcon size={24} color={c.accentText} />
          <CodeInput
            testID="handoff-code"
            label={stage.code === 'pickup' ? t('trip.pickupCode') : t('trip.deliveryOtp')}
            length={CODE_LENGTH}
            value={code}
            onChange={setCode}
          />
        </RiderCard>
      ) : null}
      {stage.actionLabel ? (
        <Button
          label={t(stage.actionLabel)}
          variant="brand"
          size="lg"
          loading={runner.busy}
          disabled={stage.code !== null && code.length !== CODE_LENGTH}
          onPress={act}
        />
      ) : null}
      {status === 'at_customer' || status === 'picked_up' ? (
        <Undeliverable trip={trip} runner={runner} />
      ) : null}
    </>
  );
}

const ORDER: readonly TripStatus[] = [
  'assigned',
  'at_vendor',
  'picked_up',
  'at_customer',
  'delivered',
  'undeliverable',
];

/** R07–R10 — navigate to store, pickup code, picked up, navigate to customer, delivery OTP. */
export default function TripScreen(): ReactElement {
  const current = useMyCurrentTrip(api);
  const runner = useTripActionRunner((trip) => {
    if (isFinal(trip.status))
      router.replace({ pathname: '/delivered', params: { outcome: trip.status } });
  });
  return (
    <Screen testID="screen-trip">
      <QueryView query={current}>
        {({ trip }) => {
          if (!trip) {
            return (
              <RiderStateMessage
                testID="trip-none"
                title={t('trip.none')}
                body={t('trip.noneBody')}
                actionLabel={t('delivered.home')}
                onAction={() => {
                  router.replace('/home');
                }}
              />
            );
          }
          const opt = runner.optimistic;
          const status = opt && ORDER.indexOf(opt) > ORDER.indexOf(trip.status) ? opt : trip.status;
          return <TripStageView key={status} trip={trip} status={status} runner={runner} />;
        }}
      </QueryView>
    </Screen>
  );
}
