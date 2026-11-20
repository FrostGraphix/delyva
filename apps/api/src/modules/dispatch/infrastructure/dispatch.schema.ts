import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Dispatch context tables. `user_id`/`order_id`/`branch_id` reference other contexts by value
 * only (no cross-context FKs) so dispatch can be extracted into its own service.
 */
export const riderProfiles = pgTable(
  'rider_profiles',
  {
    userId: uuid('user_id').primaryKey(),
    vehiclePlate: text('vehicle_plate'),
    hub: text('hub'),
    batteryPct: smallint('battery_pct'),
    status: text('status').notNull().default('offline'),
    offersReceived: integer('offers_received').notNull().default(0),
    offersAccepted: integer('offers_accepted').notNull().default(0),
    offersDeclined: integer('offers_declined').notNull().default(0),
    offersExpired: integer('offers_expired').notNull().default(0),
    ratingX100: integer('rating_x100').notNull().default(500),
    lastJobAt: timestamp('last_job_at', { withTimezone: true }),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('rider_profiles_status_ck', sql`${t.status} IN ('offline', 'online', 'on_trip')`),
    check('rider_profiles_battery_ck', sql`${t.batteryPct} BETWEEN 0 AND 100`),
    check('rider_profiles_rating_ck', sql`${t.ratingX100} BETWEEN 0 AND 500`),
    check('rider_profiles_plate_ck', sql`${t.vehiclePlate} ~ '^[A-Z]{3}-[0-9]{3}-[A-Z]{2}$'`),
    index('rider_profiles_status_idx').on(t.status),
  ],
);

/** Per-order dispatch state, created from `ordering.order.vendor_accepted`. */
export const dispatchRequests = pgTable(
  'dispatch_requests',
  {
    orderId: uuid('order_id').primaryKey(),
    branchId: uuid('branch_id').notNull(),
    pickupLat: doublePrecision('pickup_lat').notNull(),
    pickupLng: doublePrecision('pickup_lng').notNull(),
    dropoffLat: doublePrecision('dropoff_lat').notNull(),
    dropoffLng: doublePrecision('dropoff_lng').notNull(),
    prepMinutes: integer('prep_minutes').notNull(),
    readyAt: timestamp('ready_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('scheduled'),
    radiusStep: integer('radius_step').notNull().default(0),
    declines: integer('declines').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'dispatch_requests_status_ck',
      sql`${t.status} IN ('scheduled', 'searching', 'assigned', 'unassigned')`,
    ),
    index('dispatch_requests_status_idx').on(t.status),
  ],
);

/** Job offers; at most one pending offer per order and per rider (partial unique indexes). */
export const dispatchOffers = pgTable(
  'dispatch_offers',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id').notNull(),
    riderId: uuid('rider_id').notNull(),
    status: text('status').notNull(),
    radiusM: integer('radius_m').notNull(),
    distanceM: integer('distance_m').notNull(),
    etaSeconds: integer('eta_seconds').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'dispatch_offers_status_ck',
      sql`${t.status} IN ('pending', 'accepted', 'declined', 'expired', 'superseded')`,
    ),
    uniqueIndex('dispatch_offers_pending_order_uq')
      .on(t.orderId)
      .where(sql`status = 'pending'`),
    uniqueIndex('dispatch_offers_pending_rider_uq')
      .on(t.riderId)
      .where(sql`status = 'pending'`),
    index('dispatch_offers_order_idx').on(t.orderId),
  ],
);

/** Rider trips; at most one active trip per order and per rider (partial unique indexes). */
export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id').notNull(),
    riderId: uuid('rider_id').notNull(),
    offerId: uuid('offer_id'),
    status: text('status').notNull(),
    pickupLat: doublePrecision('pickup_lat').notNull(),
    pickupLng: doublePrecision('pickup_lng').notNull(),
    dropoffLat: doublePrecision('dropoff_lat').notNull(),
    dropoffLng: doublePrecision('dropoff_lng').notNull(),
    assignment: text('assignment').notNull(),
    assignedBy: uuid('assigned_by'),
    assignmentReason: text('assignment_reason'),
    undeliverableReason: text('undeliverable_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'trips_status_ck',
      sql`${t.status} IN ('assigned', 'at_vendor', 'picked_up', 'at_customer', 'delivered', 'undeliverable')`,
    ),
    check('trips_assignment_ck', sql`${t.assignment} IN ('offer', 'manual')`),
    check(
      'trips_manual_reason_ck',
      sql`${t.assignment} = 'offer' OR (${t.assignedBy} IS NOT NULL AND ${t.assignmentReason} IS NOT NULL)`,
    ),
    uniqueIndex('trips_active_order_uq')
      .on(t.orderId)
      .where(sql`status IN ('assigned', 'at_vendor', 'picked_up', 'at_customer')`),
    uniqueIndex('trips_active_rider_uq')
      .on(t.riderId)
      .where(sql`status IN ('assigned', 'at_vendor', 'picked_up', 'at_customer')`),
    index('trips_rider_status_idx').on(t.riderId, t.status),
  ],
);

/** Outbox events this context has consumed (idempotent consumer receipts). */
export const dispatchEventReceipts = pgTable('dispatch_event_receipts', {
  eventId: uuid('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  outcome: text('outcome').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
