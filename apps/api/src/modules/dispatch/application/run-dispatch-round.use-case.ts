import {
  DISPATCH_EVENTS,
  type OfferSentPayload,
  type OrderUnassignedPayload,
} from '@delyva/contracts';
import type { Logger } from 'pino';
import type { DispatchStrategy, RankedCandidate } from '../domain/dispatch-strategy.js';
import { acceptanceRateBps } from '../domain/rider.js';
import { toOfferDto } from './dto.js';
import type {
  Clock,
  DispatchConfig,
  DispatchRequest,
  DispatchScheduler,
  DispatchStore,
  OfferNotifier,
  OfferRecord,
  OrderLock,
  Tracking,
  ZoneLookup,
} from './ports.js';

/** Result of one round. */
export type RoundOutcome =
  | {
      readonly kind: 'offered';
      readonly offerId: string;
      readonly riderId: string;
      readonly radiusM: number;
    }
  | { readonly kind: 'unassigned'; readonly reason: OrderUnassignedPayload['reason'] }
  | { readonly kind: 'skipped'; readonly reason: string };

/** Dependencies of {@link RunDispatchRound}. */
export interface RoundDeps {
  readonly store: DispatchStore;
  readonly tracking: Tracking;
  readonly zones: ZoneLookup;
  readonly strategy: DispatchStrategy;
  readonly lock: OrderLock;
  readonly scheduler: DispatchScheduler;
  readonly notifier: OfferNotifier;
  readonly clock: Clock;
  readonly config: DispatchConfig;
  readonly logger: Logger;
}

const CANDIDATE_SCAN = 50;
const CLOSED = new Set(['assigned', 'unassigned']);

/**
 * Command: offer the order to the single best eligible rider, holding the order lock.
 * One pending offer per order at a time; the radius widens when nobody is eligible (and,
 * via {@link radiusStepForDeclines}, after N declines); exhausting every radius or the offer
 * budget escalates to ops with `dispatch.order.unassigned`.
 */
export class RunDispatchRound {
  /** @param deps ports */
  constructor(private readonly deps: RoundDeps) {}

  /** Executes one round for an order. */
  execute(orderId: string): Promise<RoundOutcome> {
    return this.deps.lock.withLock(orderId, () => this.round(orderId));
  }

  private async round(orderId: string): Promise<RoundOutcome> {
    const { store, config } = this.deps;
    const req = await store.getRequest(orderId);
    if (!req) return { kind: 'skipped', reason: 'unknown_order' };
    if (CLOSED.has(req.status)) return { kind: 'skipped', reason: req.status };
    if (await store.pendingOfferForOrder(orderId))
      return { kind: 'skipped', reason: 'offer_pending' };
    if (req.attempts >= config.maxOffers) return this.escalate(req, 'max_offers_reached');
    for (let step = req.radiusStep; step < config.radiiM.length; step++) {
      const radiusM = config.radiiM[step] ?? 0;
      const best = await this.bestCandidate(req, radiusM);
      if (best) return this.offer(req, best, radiusM, step);
    }
    return this.escalate(req, 'no_candidates');
  }

  private async bestCandidate(
    req: DispatchRequest,
    radiusM: number,
  ): Promise<RankedCandidate | null> {
    const { store, tracking, strategy, clock, config } = this.deps;
    const near = await tracking.ridersNear(req.pickup.lat, req.pickup.lng, radiusM, CANDIDATE_SCAN);
    if (near.length === 0) return null;
    const ids = near.map((n) => n.riderId);
    const [profiles, offered, busy] = await Promise.all([
      store.ridersByIds(ids),
      store.offeredRiderIds(req.orderId),
      store.ridersWithPendingOffers(ids),
    ]);
    const excluded = new Set([...offered, ...busy]);
    const online = new Map(
      profiles.filter((p) => p.status === 'online').map((p) => [p.riderId, p]),
    );
    const candidates = near.flatMap((n) => {
      const p = online.get(n.riderId);
      if (!p || excluded.has(n.riderId)) return [];
      return [
        {
          riderId: n.riderId,
          distanceM: n.distanceM,
          acceptanceRateBps: acceptanceRateBps(p),
          ratingX100: p.ratingX100,
          lastJobAt: p.lastJobAt,
        },
      ];
    });
    const ranked = strategy.rank(candidates, {
      now: clock.now(),
      riderSpeedMps: config.riderSpeedMps,
    });
    return this.firstInZone(req, ranked);
  }

  /** Riders must be inside a zone that serves the pickup (skipped when the pickup has no zone). */
  private async firstInZone(
    req: DispatchRequest,
    ranked: RankedCandidate[],
  ): Promise<RankedCandidate | null> {
    const { zones, tracking, logger } = this.deps;
    if (ranked.length === 0) return null;
    const pickupZones = await zones.zonesContaining(req.pickup);
    if (pickupZones.length === 0) {
      logger.warn({ orderId: req.orderId }, 'pickup outside every zone; zone filter skipped');
      return ranked[0] ?? null;
    }
    for (const c of ranked) {
      const pos = await tracking.positionOf(c.riderId);
      if (!pos) continue;
      const riderZones = await zones.zonesContaining(pos);
      if (riderZones.some((z) => pickupZones.includes(z))) return c;
    }
    return null;
  }

  private async offer(
    req: DispatchRequest,
    c: RankedCandidate,
    radiusM: number,
    step: number,
  ): Promise<RoundOutcome> {
    const { store, clock, config } = this.deps;
    const now = clock.now();
    const offer: OfferRecord = {
      id: clock.uuid(),
      orderId: req.orderId,
      riderId: c.riderId,
      status: 'pending',
      radiusM,
      distanceM: Math.round(c.distanceM),
      etaSeconds: c.pickupEtaSeconds,
      expiresAt: new Date(now.getTime() + config.offerTimeoutMs),
      createdAt: now,
    };
    const attempt = req.attempts + 1;
    await store.transaction(async (tx) => {
      await tx.insertOffer(offer);
      await tx.updateRequest(req.orderId, {
        status: 'searching',
        attempts: attempt,
        radiusStep: step,
      });
      await tx.incrementRider(c.riderId, 'offersReceived');
      const payload: OfferSentPayload = {
        offerId: offer.id,
        orderId: req.orderId,
        riderId: c.riderId,
        attempt,
        radiusM,
        expiresAt: offer.expiresAt.toISOString(),
      };
      await tx.emit({
        type: DISPATCH_EVENTS.offerSent,
        aggregateType: 'dispatch_offer',
        aggregateId: offer.id,
        payload,
      });
    });
    await this.deliver(offer, req);
    return { kind: 'offered', offerId: offer.id, riderId: c.riderId, radiusM };
  }

  private async deliver(offer: OfferRecord, req: DispatchRequest): Promise<void> {
    const { scheduler, notifier, config, logger } = this.deps;
    await scheduler.scheduleTimeout(offer.id, config.offerTimeoutMs);
    try {
      await notifier.offerSent(
        offer.riderId,
        toOfferDto(offer, req),
        Math.ceil(config.offerTimeoutMs / 1_000),
      );
    } catch (err) {
      // The offer stands (rider can still fetch it); the timeout moves on if nobody answers.
      logger.warn({ err, offerId: offer.id }, 'offer notification failed');
    }
  }

  private async escalate(
    req: DispatchRequest,
    reason: OrderUnassignedPayload['reason'],
  ): Promise<RoundOutcome> {
    const { store, config, logger } = this.deps;
    const payload: OrderUnassignedPayload = {
      orderId: req.orderId,
      attempts: req.attempts,
      maxRadiusM: config.radiiM.at(-1) ?? 0,
      reason,
    };
    await store.transaction(async (tx) => {
      await tx.updateRequest(req.orderId, {
        status: 'unassigned',
        radiusStep: config.radiiM.length - 1,
      });
      await tx.emit({
        type: DISPATCH_EVENTS.orderUnassigned,
        aggregateType: 'dispatch_order',
        aggregateId: req.orderId,
        payload,
      });
    });
    logger.warn({ orderId: req.orderId, reason }, 'order unassigned; ops manual dispatch required');
    return { kind: 'unassigned', reason };
  }
}
