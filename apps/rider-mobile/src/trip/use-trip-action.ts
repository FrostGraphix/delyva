import type { Trip, TripStatus } from '@delyva/contracts';
import { dispatchKeys, type TripActionBodies, type TripActionSegment } from '@delyva/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { problemCode } from '../api/errors';
import { t } from '../i18n';
import { currentFix } from '../location/location-store';
import { confirmHaptic } from '../offer/offer-alert';
import { performTripAction } from '../offline/trip-actions';
import { nextStatus } from './trip-stage';

/** Plain-language message for a refused trip action. */
function messageFor(err: unknown): string {
  const code = problemCode(err);
  if (code === 'validation_failed') return t('trip.codeWrong');
  if (code === 'rider_too_far') return t('trip.tooFar');
  return t('common.errorBody');
}

/** Trip action runner with offline queueing and optimistic progress. */
export interface TripActionRunner {
  readonly busy: boolean;
  readonly error: string | null;
  readonly queued: boolean;
  /** Status to show while a queued action waits (null = use the server's). */
  readonly optimistic: TripStatus | null;
  run<S extends TripActionSegment>(
    trip: Trip,
    action: S,
    body: Omit<TripActionBodies[S], 'location'>,
  ): void;
}

/** Runs trip actions through the persisted queue, attaching the device fix for the GPS check. */
export function useTripActionRunner(onDone: (trip: Trip) => void): TripActionRunner {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [optimistic, setOptimistic] = useState<TripStatus | null>(null);
  const run: TripActionRunner['run'] = (trip, action, body) => {
    setBusy(true);
    setError(null);
    void currentFix()
      .then((fix) =>
        performTripAction(trip.id, action, {
          ...body,
          ...(fix ? { location: fix } : {}),
        } as TripActionBodies[typeof action]),
      )
      .then((outcome) => {
        if (outcome.kind === 'sent') {
          setQueued(false);
          setOptimistic(null);
          qc.setQueryData(dispatchKeys.currentTrip(), { trip: outcome.trip });
          confirmHaptic();
          onDone(outcome.trip);
        } else if (outcome.kind === 'queued') {
          setQueued(true);
          setOptimistic(nextStatus(action));
        } else setError(messageFor(outcome.error));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, error, queued, optimistic, run };
}
