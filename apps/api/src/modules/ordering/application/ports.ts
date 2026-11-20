import type {
  OrderActorType,
  OrderStatus,
  PaymentIntent,
  PaymentMethod,
} from '@delyva/contracts';
import type { LatLng, Money } from '@delyva/utils';
import type { CartLineState } from '../domain/cart.js';
import type { OrderTotalsMinor, SplitTerms } from '../domain/order-money.js';

/** A persisted order (codes stored only as hashes). */
export interface OrderRecord {
  readonly id: string;
  readonly customerId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly branchId: string;
  readonly status: OrderStatus;
  readonly paymentMethod: PaymentMethod;
  readonly paymentIntentId: string | null;
  /** Provider checkout URL (card/transfer), null for wallet. */
  readonly paymentAuthorizationUrl: string | null;
  readonly totals: OrderTotalsMinor;
  readonly promoCode: string | null;
  readonly pickup: LatLng;
  readonly dropoff: LatLng;
  readonly prepMinutes: number | null;
  readonly readyAt: Date | null;
  readonly etaMinutes: number;
  readonly riderId: string | null;
  readonly deliveryOtpHash: string;
  readonly pickupCodeHash: string;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Mutable order fields. */
export type OrderPatch = Partial<
  Pick<OrderRecord, 'status' | 'paymentIntentId' | 'paymentAuthorizationUrl' | 'prepMinutes' | 'readyAt' | 'riderId'>
>;

/** A modifier option frozen on an order line. */
export interface FrozenOption {
  readonly id: string;
  readonly name: string;
  readonly priceDeltaMinor: number;
}

/** One ordered line, frozen at checkout. */
export interface OrderItemRecord {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly options: readonly FrozenOption[];
}

/** Append-only status history entry. */
export interface StatusHistoryRecord {
  readonly status: OrderStatus;
  readonly at: Date;
  readonly actorType: OrderActorType;
  readonly actorId: string | null;
  readonly reason: string | null;
}

/** Domain event to append to the outbox inside the order transaction. */
export interface OrderingEvent {
  readonly type: string;
  readonly aggregateId: string;
  readonly payload: unknown;
}

/** Promo redemption command (pricing's RedeemPromo, run in the order transaction). */
export interface PromoRedemption {
  readonly code: string;
  readonly userId: string;
  readonly orderId: string;
  readonly itemsSubtotalMinor: number;
  readonly discountMinor: number;
}

/** Operations inside one order transaction. */
export interface OrderTx {
  /** Inserts the order and its lines. */
  insertOrder(order: OrderRecord, items: readonly OrderItemRecord[]): Promise<void>;
  /** `SELECT … FOR UPDATE` on the order row. */
  lockOrder(orderId: string): Promise<OrderRecord | null>;
  /** Applies a patch (and bumps updated_at). */
  updateOrder(orderId: string, patch: OrderPatch, at: Date): Promise<void>;
  /** Appends a status history row. */
  appendHistory(orderId: string, entry: StatusHistoryRecord): Promise<void>;
  /** Appends an outbox event. */
  appendEvent(event: OrderingEvent): Promise<void>;
  /** Redeems a promo atomically with the order. @throws pricing errors */
  redeemPromo(cmd: PromoRedemption): Promise<void>;
  /** Deletes the user's cart. */
  deleteCart(userId: string, cartId: string): Promise<void>;
}

/** Order list filter (all optional; customer/vendor scope set by the use case). */
export interface OrderFilter {
  readonly customerId?: string | undefined;
  readonly vendorId?: string | undefined;
  readonly status?: OrderStatus | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
}

/** Keyset position for pagination (created_at desc, id desc). */
export interface PageCursor {
  readonly createdAt: Date;
  readonly id: string;
}

/** Row of an order list. */
export interface OrderListRow {
  readonly order: OrderRecord;
  readonly itemCount: number;
}

/** Order persistence. */
export interface OrderStore {
  /** Runs `work` in one database transaction. */
  transaction<T>(work: (tx: OrderTx) => Promise<T>): Promise<T>;
  /** One order by id. */
  findById(orderId: string): Promise<OrderRecord | null>;
  /** Order created by a customer's checkout with this Idempotency-Key. */
  findByIdempotencyKey(customerId: string, key: string): Promise<OrderRecord | null>;
  /** Lines of an order. */
  items(orderId: string): Promise<OrderItemRecord[]>;
  /** History of an order, oldest first. */
  history(orderId: string): Promise<StatusHistoryRecord[]>;
  /** Newest first, keyset paginated. */
  list(filter: OrderFilter, limit: number, after: PageCursor | null): Promise<OrderListRow[]>;
}

/** A stored cart. */
export interface CartState {
  readonly id: string;
  readonly userId: string;
  readonly vendorId: string;
  readonly branchId: string;
  readonly version: number;
  readonly lines: readonly CartLineState[];
  readonly updatedAt: Date;
}

/** Cart persistence (scoped by owner). */
export interface CartStore {
  /** The user's cart by id (null for foreign ids). */
  findForUser(userId: string, cartId: string): Promise<CartState | null>;
  /** The user's cart for a branch. */
  findByBranch(userId: string, branchId: string): Promise<CartState | null>;
  /** All the user's carts, most recently updated first. */
  listForUser(userId: string): Promise<CartState[]>;
  /**
   * Inserts (expectedVersion null) or replaces lines with optimistic concurrency.
   * Returns false when the version moved (caller retries).
   */
  save(cart: CartState, expectedVersion: number | null): Promise<boolean>;
  /** Deletes the user's cart; false when missing. */
  delete(userId: string, cartId: string): Promise<boolean>;
}

/** Branch info ordering needs (from catalog's CatalogService). */
export interface OrderingBranchView {
  readonly branchId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly zoneId: string;
  readonly location: LatLng;
  readonly prepMinutes: number;
  readonly acceptingOrders: boolean;
}

/** A selection priced by the catalog. */
export interface PricedLine {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly options: readonly FrozenOption[];
  readonly problem: string | null;
}

/** What ordering needs from catalog. */
export interface CatalogPort {
  /** Branch + vendor status; null when unknown. */
  branch(branchId: string): Promise<OrderingBranchView | null>;
  /** Live prices for the selections. */
  priceSelections(
    vendorId: string,
    lines: readonly { itemId: string; quantity: number; optionIds: readonly string[] }[],
  ): Promise<PricedLine[]>;
  /** Vendor membership of a user. */
  memberRole(vendorId: string, userId: string): Promise<'owner' | 'staff' | null>;
}

/** What ordering needs from geo. */
export interface GeoPort {
  /** The user's address (null when foreign/unknown). */
  addressOf(userId: string, addressId: string): Promise<{ lat: number; lng: number } | null>;
  /** Zones (with city) covering a point. */
  zonesAt(point: LatLng): Promise<{ id: string; city: string }[]>;
  /** Customer-facing ETA. */
  deliveryEstimate(
    from: LatLng,
    to: LatLng,
    prepMinutes: number,
  ): Promise<{ distanceMeters: number; etaMinutes: number }>;
}

/** Itemised quote from pricing (kobo). */
export interface QuoteView {
  readonly totals: OrderTotalsMinor;
  readonly promo: { code: string; applied: boolean; reason?: string | undefined } | null;
}

/** What ordering needs from pricing. */
export interface PricingPort {
  /** Prices the lines (never trusts client prices). */
  quote(cmd: {
    userId: string;
    zoneCode: string;
    pickup: LatLng;
    dropoff: LatLng;
    lines: readonly { unitPriceMinor: number; quantity: number; modifierDeltasMinor: number[] }[];
    promoCode?: string | undefined;
  }): Promise<QuoteView>;
}

/** Breakdown passed to payments' capture. */
export interface CaptureBreakdown {
  readonly customerUserId: string;
  readonly vendorId: string;
  readonly riderId: string | null;
  readonly customerPaid: Money;
  readonly vendor: Money;
  readonly rider: Money;
  readonly platformFee: Money;
  readonly tax: Money;
  readonly promo: Money;
}

/** What ordering needs from payments (PaymentsService). */
export interface PaymentsPort {
  /** Wallet: hold + succeeded intent; card/transfer: provider checkout. Idempotent per order. */
  createIntentForOrder(input: {
    orderId: string;
    userId: string;
    amount: Money;
    method: PaymentMethod;
  }): Promise<PaymentIntent>;
  /** Captures the hold and posts the split. Idempotent per order. */
  captureOrderSplit(orderId: string, breakdown: CaptureBreakdown): Promise<{ transactionId: string }>;
  /** Releases an uncaptured hold. Idempotent. */
  releaseOrderHold(orderId: string): Promise<{ released: boolean }>;
}

/** Realtime fan-out (LIVE_TRACKING). */
export interface TrackingPort {
  /** Status update to the order room. */
  publishOrderStatus(orderId: string, status: string, at: Date): void;
  /** Bind rider location to the order room. */
  startTrip(riderId: string, orderId: string): Promise<void>;
  /** Stop sharing rider location. */
  endTrip(riderId: string): Promise<void>;
}

/** Delayed vendor-timeout jobs (BullMQ). */
export interface AutoRejectScheduler {
  /** Schedules the auto-reject check for an order (idempotent per order). */
  schedule(orderId: string, delayMs: number): Promise<void>;
  /** Removes a pending job (best effort). */
  cancel(orderId: string): Promise<void>;
}

/** Delivery OTP and pickup code: derived from a server secret, stored only as hashes. */
export interface OrderCodes {
  /** 4-digit delivery OTP for the customer. */
  deliveryOtp(orderId: string): string;
  /** 4-digit pickup code shown to the vendor. */
  pickupCode(orderId: string): string;
  /** Hash stored at rest. */
  hash(orderId: string, purpose: 'delivery' | 'pickup', code: string): string;
  /** Constant-time comparison against the stored hash. */
  verify(orderId: string, purpose: 'delivery' | 'pickup', code: string, hash: string): boolean;
}

/** Time and ids. */
export interface Clock {
  /** Now. */
  now(): Date;
  /** UUID v4. */
  uuid(): string;
}

/** Structured logger (pino-compatible subset). */
export interface OrderingLogger {
  /** Info. */
  info(obj: object, msg: string): void;
  /** Warning. */
  warn(obj: object, msg: string): void;
  /** Error. */
  error(obj: object, msg: string): void;
}

/** Ordering configuration. */
export interface OrderingConfig {
  /** Vendor response window before auto-reject. */
  readonly autoRejectMs: number;
  /** Split terms. */
  readonly terms: SplitTerms;
}
