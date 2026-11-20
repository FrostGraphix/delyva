import {
  DISPATCH_EVENTS,
  type DispatchOffer,
  type OfferAcceptedPayload,
  type OfferDeclinedPayload,
  type Trip,
} from '@delyva/contracts';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import { DispatchError } from '../domain/dispatch-errors.js';
import { radiusStepForDeclines } from '../domain/dispatch-strategy.js';
import { type AssignDeps, assertAssignable, assignRider } from './assign-rider.js';
import { toOfferDto, toTripDto } from './dto.js';
import type {
  DispatchConfig,
  DispatchRequest,
  DispatchScheduler,
  OfferRecord,
  OrderLock,
} from './ports.js';
import { assertRider } from './rider-availability.use-cases.js';

/** Dependencies of the offer response commands. */
export interface OfferResponseDeps extends AssignDeps {
  readonly lock: OrderLock;
  readonly scheduler: DispatchScheduler;
  readonly config: Pick<DispatchConfig, 'declinesBeforeWiden' | 'radiiM'>;
}

const notFound = (): DispatchError => new DispatchError('not_found', 'Offer not found.');
const unavailable = (): DispatchError =>
  new DispatchError('offer_unavailable', 'This offer is no longer available.');

/** Accept / decline (rider) and expire (timeout job) a job offer. */
export class RespondToOffer {
  /** @param deps ports */
  constructor(private readonly deps: OfferResponseDeps) {}

  /** Loads an offer addressed to the caller; other riders' offers look like 404 (IDOR). */
  private async own(principal: AuthPrincipal, offerId: string): Promise<OfferRecord> {
    const riderId = assertRider(principal);
    const offer = await this.deps.store.getOffer(offerId);
    if (offer?.riderId !== riderId) throw notFound();
    return offer;
  }

  private async load(offerId: string): Promise<{ offer: OfferRecord; req: DispatchRequest }> {
    const offer = await this.deps.store.getOffer(offerId);
    const req = offer ? await this.deps.store.getRequest(offer.orderId) : null;
    if (!offer || !req) throw notFound();
    return { offer, req };
  }

  /** POST /v1/dispatch-offers/{id}/accept — replays after success return the same trip. */
  async accept(principal: AuthPrincipal, offerId: string): Promise<Trip> {
    const mine = await this.own(principal, offerId);
    return this.deps.lock.withLock(mine.orderId, async () => {
      const { offer, req } = await this.load(offerId);
      if (offer.status === 'accepted') {
        const trip = await this.deps.store.activeTripForOrder(offer.orderId);
        if (trip?.offerId === offer.id) return toTripDto(trip);
      }
      if (offer.status !== 'pending' || offer.expiresAt <= this.deps.clock.now())
        throw unavailable();
      await assertAssignable(this.deps.store, offer.orderId, offer.riderId);
      const trip = await assignRider(
        this.deps,
        req,
        offer.riderId,
        { offerId: offer.id, assignedBy: null, reason: null },
        (t) => ({
          type: DISPATCH_EVENTS.offerAccepted,
          aggregateType: 'dispatch_offer',
          aggregateId: offer.id,
          payload: {
            offerId: offer.id,
            orderId: offer.orderId,
            riderId: offer.riderId,
            tripId: t.id,
          } satisfies OfferAcceptedPayload,
        }),
        async (tx) => {
          await tx.setOfferStatus(offer.id, 'accepted', this.deps.clock.now());
          await tx.incrementRider(offer.riderId, 'offersAccepted');
        },
      );
      return toTripDto(trip);
    });
  }

  /** POST /v1/dispatch-offers/{id}/decline — the next candidate is offered right away. */
  async decline(principal: AuthPrincipal, offerId: string): Promise<DispatchOffer> {
    const mine = await this.own(principal, offerId);
    const result = await this.deps.lock.withLock(mine.orderId, async () => {
      const { offer, req } = await this.load(offerId);
      if (offer.status === 'declined') return toOfferDto(offer, req);
      if (offer.status !== 'pending') throw unavailable();
      await this.close(offer, req, 'declined');
      return toOfferDto({ ...offer, status: 'declined' }, req);
    });
    await this.deps.scheduler.scheduleNextRound(mine.orderId, offerId);
    return result;
  }

  /** Timeout job: a still-pending offer expires and the next round is scheduled. */
  async expire(offerId: string): Promise<boolean> {
    const offer = await this.deps.store.getOffer(offerId);
    if (!offer) return false;
    const expired = await this.deps.lock.withLock(offer.orderId, async () => {
      const { offer: fresh, req } = await this.load(offerId);
      if (fresh.status !== 'pending') return false;
      await this.close(fresh, req, 'expired');
      return true;
    });
    if (expired) await this.deps.scheduler.scheduleNextRound(offer.orderId, offerId);
    return expired;
  }

  /** Declines and timeouts both count towards radius widening. */
  private async close(
    offer: OfferRecord,
    req: DispatchRequest,
    reason: OfferDeclinedPayload['reason'],
  ): Promise<void> {
    const { config, clock } = this.deps;
    const declines = req.declines + 1;
    const step = Math.max(
      req.radiusStep,
      radiusStepForDeclines(declines, config.declinesBeforeWiden, config.radiiM.length),
    );
    await this.deps.store.transaction(async (tx) => {
      await tx.setOfferStatus(offer.id, reason, clock.now());
      await tx.updateRequest(req.orderId, { declines, radiusStep: step });
      await tx.incrementRider(
        offer.riderId,
        reason === 'declined' ? 'offersDeclined' : 'offersExpired',
      );
      const payload: OfferDeclinedPayload = {
        offerId: offer.id,
        orderId: offer.orderId,
        riderId: offer.riderId,
        reason,
      };
      await tx.emit({
        type: DISPATCH_EVENTS.offerDeclined,
        aggregateType: 'dispatch_offer',
        aggregateId: offer.id,
        payload,
      });
    });
  }
}
