import type { DispatchOffer } from '@delyva/contracts';
import type { GeoService } from '../../geo/application/geo.service.js';
import type { NotifyUser } from '../../notifications/application/notify-user.use-case.js';
import type { SocketRoomBroadcaster } from '../../realtime/infrastructure/socket-io.js';
import type { OfferNotifier, Point, ZoneLookup } from '../application/ports.js';

/**
 * Delivers an offer over the rider's private socket room and as a push notification
 * (notifications context, idempotent per offer id). The socket emit is fire-and-forget.
 */
export class SocketAndPushOfferNotifier implements OfferNotifier {
  /** @param rooms realtime broadcaster @param notify notifications command */
  constructor(
    private readonly rooms: Pick<SocketRoomBroadcaster, 'dispatchOffer'>,
    private readonly notify: Pick<NotifyUser, 'execute'>,
  ) {}

  /** @inheritdoc */
  async offerSent(riderId: string, offer: DispatchOffer, timeoutSeconds: number): Promise<void> {
    this.rooms.dispatchOffer(riderId, offer);
    await this.notify.execute({
      userId: riderId,
      template: 'rider.dispatch_offer',
      params: { seconds: String(timeoutSeconds) },
      data: { offerId: offer.id, orderId: offer.orderId },
      sourceEventId: offer.id,
    });
  }
}

/** Zone lookup through the geo context's public service. */
export class GeoZoneLookup implements ZoneLookup {
  /** @param geo geo service */
  constructor(private readonly geo: Pick<GeoService, 'zonesContaining'>) {}

  /** @inheritdoc */
  zonesContaining(point: Point): Promise<string[]> {
    return this.geo.zonesContaining(point);
  }
}
