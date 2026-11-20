import type { Principal } from '../../../shared/auth/access-token.verifier.js';
import type { OrderRoomAuthorizer } from '../application/ports.js';

/**
 * Default until the ordering context provides a real authorizer: nobody (except ops staff, who
 * are checked before this) may join an order room.
 */
export class DenyByDefaultOrderRoomAuthorizer implements OrderRoomAuthorizer {
  /** @inheritdoc */
  canJoin(_principal: Principal, _orderId: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/** Test double: explicit participants per order. */
export class InMemoryOrderRoomAuthorizer implements OrderRoomAuthorizer {
  private readonly participants = new Map<string, Set<string>>();

  /** Grants `userId` access to `orderId`. */
  allow(orderId: string, userId: string): this {
    const set = this.participants.get(orderId) ?? new Set<string>();
    set.add(userId);
    this.participants.set(orderId, set);
    return this;
  }

  /** @inheritdoc */
  canJoin(principal: Principal, orderId: string): Promise<boolean> {
    return Promise.resolve(this.participants.get(orderId)?.has(principal.userId) ?? false);
  }
}
