import type { DispatchOffer, Trip } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { dispatchKeys } from '@delyva/sdk';
import { RiderBanner, Button, RiderCard, StatTile, RiderStateMessage, Typography } from '@delyva/ui-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactElement, useRef } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { problemCode } from '../src/api/errors';
import { t } from '../src/i18n';
import { formatDistance, formatMinutes } from '../src/lib/format';
import { newId } from '../src/lib/ids';
import { useCountdown } from '../src/offer/countdown';
import { confirmHaptic } from '../src/offer/offer-alert';
import { useRealtime } from '../src/realtime/realtime-store';
import { Screen } from '../src/ui/screen';

const leave = (): void => {
  useRealtime.getState().setOffer(null);
  if (router.canGoBack()) router.back();
  else router.replace('/home');
};

/** Countdown, distance, ETA, earnings and the accept/decline actions for one offer. */
function OfferCard({ offer }: { offer: DispatchOffer }): ReactElement {
  const left = useCountdown(offer.expiresAt);
  const qc = useQueryClient();
  const keys = useRef({ accept: newId(), decline: newId() });
  const respond = useMutation({
    mutationFn: (accept: boolean): Promise<{ trip: Trip | null }> =>
      accept
        ? api.acceptDispatchOffer(offer.id, keys.current.accept).then((trip) => ({ trip }))
        : api.declineDispatchOffer(offer.id, keys.current.decline).then(() => ({ trip: null })),
    onSuccess: ({ trip }) => {
      void qc.invalidateQueries({ queryKey: dispatchKeys.all });
      useRealtime.getState().setOffer(null);
      if (trip) {
        confirmHaptic();
        qc.setQueryData(dispatchKeys.currentTrip(), { trip });
        router.replace('/trip');
      } else leave();
    },
  });
  const gone = problemCode(respond.error) === 'offer_unavailable' || left === 0;
  if (gone) {
    return (
      <RiderStateMessage
        testID="offer-gone"
        title={t('offer.expired')}
        body={t('offer.gone')}
        actionLabel={t('delivered.home')}
        onAction={leave}
      />
    );
  }
  return (
    <>
      <Typography
        variant="display"
        testID="offer-countdown"
        accessibilityLabel={t('offer.secondsLeft', { seconds: left })}
        center
      >
        {String(left)}
      </Typography>
      <Typography tone="muted" center>
        {t('offer.secondsLeft', { seconds: left })}
      </Typography>
      <View style={{ flexDirection: 'row', gap: tokens.space[3] }}>
        <StatTile
          testID="offer-distance"
          label={t('offer.toPickup')}
          value={formatDistance(offer.distanceToPickupM)}
        />
        <StatTile
          testID="offer-eta"
          label={t('offer.pickupEta')}
          value={formatMinutes(offer.pickupEtaSeconds)}
        />
      </View>
      {/* DEBT(dispatch): DispatchOffer has no earnings field — add an estimated rider payout to the offer contract. */}
      <RiderCard testID="offer-earnings">
        <Typography variant="caption" tone="muted">
          {t('offer.earnings')}
        </Typography>
        <Typography variant="h3">{t('offer.earningsPending')}</Typography>
      </RiderCard>
      {respond.isError ? <RiderBanner tone="danger" text={t('common.errorBody')} /> : null}
      <Button
        label={t('offer.accept')}
        variant="brand"
        size="lg"
        loading={respond.isPending && respond.variables}
        disabled={respond.isPending}
        onPress={() => {
          respond.mutate(true);
        }}
      />
      <Button
        label={t('offer.decline')}
        variant="ghost"
        size="lg"
        disabled={respond.isPending}
        onPress={() => {
          respond.mutate(false);
        }}
      />
    </>
  );
}

/** R06 — incoming offer (from the `dispatch:offer` socket event) with a 20 s countdown. */
export default function OfferScreen(): ReactElement {
  const offer = useRealtime((s) => s.offer);
  return (
    <Screen testID="screen-offer" title={t('offer.title')}>
      {offer ? (
        <OfferCard key={offer.id} offer={offer} />
      ) : (
        <RiderStateMessage
          testID="offer-gone"
          title={t('offer.expired')}
          body={t('offer.gone')}
          actionLabel={t('delivered.home')}
          onAction={leave}
        />
      )}
    </Screen>
  );
}
