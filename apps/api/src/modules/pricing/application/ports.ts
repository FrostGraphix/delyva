import type { FeeRuleConfig } from '../domain/fee-rule.js';
import type { PromoConfig } from '../domain/promo.js';
import type { SurgeRuleConfig } from '../domain/surge.js';

/** Time and id source. */
export interface Clock {
  /** Current instant. */
  now(): Date;
  /** New UUID v4. */
  uuid(): string;
}

/** Persisted fee rule. */
export interface StoredFeeRule extends FeeRuleConfig {
  readonly id: string;
  readonly updatedAt: Date;
}

/** Persisted surge rule. */
export interface StoredSurgeRule extends SurgeRuleConfig {
  readonly id: string;
  readonly updatedAt: Date;
}

/** Persisted promo with counters. */
export interface StoredPromo extends PromoConfig {
  readonly updatedAt: Date;
}

/** Insert outcome when a unique key (zone, code) already exists. */
export type InsertOutcome = 'inserted' | 'duplicate';

/** Generic admin-managed config repository. */
export interface ConfigRepository<T extends { id: string }> {
  /** All rows, stable order. */
  list(): Promise<T[]>;
  /** One row by id. */
  findById(id: string): Promise<T | null>;
  /** Inserts; reports `duplicate` on a unique-key clash. */
  insert(row: T): Promise<InsertOutcome>;
  /** Replaces the mutable fields of an existing row. */
  update(row: T): Promise<void>;
}

/** Fee rules (one per zone). */
export interface FeeRuleRepository extends ConfigRepository<StoredFeeRule> {
  /** The zone's rule, active or not. */
  findByZone(zoneCode: string): Promise<StoredFeeRule | null>;
}

/** Surge rules. */
export interface SurgeRuleRepository extends ConfigRepository<StoredSurgeRule> {
  /** Active rules for a zone. */
  activeForZone(zoneCode: string): Promise<StoredSurgeRule[]>;
}

/** Promos. */
export interface PromoRepository extends ConfigRepository<StoredPromo> {
  /** By canonical (upper-case) code. */
  findByCode(code: string): Promise<StoredPromo | null>;
}

/** Customer facts used by promo eligibility. */
export interface PromoUsageReader {
  /** Redemptions of `promoId` by `userId`. */
  userRedemptionCount(promoId: string, userId: string): Promise<number>;
  /** True when the customer has no prior order. */
  isNewCustomer(userId: string): Promise<boolean>;
}

/** A recorded redemption. */
export interface RedemptionRecord {
  readonly id: string;
  readonly promoId: string;
  readonly userId: string;
  readonly orderId: string;
  readonly discountMinor: number;
}

/** Operations available while the promo row is locked (`SELECT … FOR UPDATE`). */
export interface LockedPromoScope extends PromoUsageReader {
  /** The locked promo (counters are current). */
  readonly promo: PromoConfig;
  /** Existing redemption of this promo for an order, if any. */
  redemptionForOrder(orderId: string): Promise<RedemptionRecord | null>;
  /** Inserts the redemption, bumps counters and appends `pricing.promo.redeemed` atomically. */
  record(redemption: RedemptionRecord): Promise<void>;
}

/** Runs work in one transaction holding a row lock on the promo, so concurrent redemptions serialise. */
export interface PromoRedemptionUnitOfWork {
  /** Returns null when the code does not exist. */
  withLockedPromo<T>(
    code: string,
    work: (scope: LockedPromoScope) => Promise<T>,
  ): Promise<T | null>;
}
