import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type {
  FeeRuleRepository,
  InsertOutcome,
  PromoRepository,
  StoredFeeRule,
  StoredPromo,
  StoredSurgeRule,
  SurgeRuleRepository,
} from '../application/ports.js';
import { feeRules, promos, surgeRules } from './pricing.schema.js';

type FeeRow = typeof feeRules.$inferSelect;
type SurgeRow = typeof surgeRules.$inferSelect;
type PromoRow = typeof promos.$inferSelect;

/** Maps a fee_rules row to the domain shape (currency is constrained to NGN at write time). */
export const toFeeRule = (r: FeeRow): StoredFeeRule => ({ ...r, currency: 'NGN' });
/** Maps a surge_rules row. */
export const toSurgeRule = (r: SurgeRow): StoredSurgeRule => r;
/** Maps a promos row. */
export const toPromo = (r: PromoRow): StoredPromo => r;

const outcome = (rows: unknown[]): InsertOutcome => (rows.length > 0 ? 'inserted' : 'duplicate');

/** Drizzle fee-rule repository. */
export class DrizzleFeeRuleRepository implements FeeRuleRepository {
  /** @param db drizzle handle */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async list(): Promise<StoredFeeRule[]> {
    return (await this.db.select().from(feeRules).orderBy(asc(feeRules.zoneCode))).map(toFeeRule);
  }

  /** @inheritdoc */
  async findById(id: string): Promise<StoredFeeRule | null> {
    const [row] = await this.db.select().from(feeRules).where(eq(feeRules.id, id));
    return row ? toFeeRule(row) : null;
  }

  /** @inheritdoc */
  async findByZone(zoneCode: string): Promise<StoredFeeRule | null> {
    const [row] = await this.db.select().from(feeRules).where(eq(feeRules.zoneCode, zoneCode));
    return row ? toFeeRule(row) : null;
  }

  /** @inheritdoc */
  async insert(rule: StoredFeeRule): Promise<InsertOutcome> {
    const rows = await this.db
      .insert(feeRules)
      .values({ ...rule, tiers: [...rule.tiers] })
      .onConflictDoNothing()
      .returning({ id: feeRules.id });
    return outcome(rows);
  }

  /** @inheritdoc */
  async update(rule: StoredFeeRule): Promise<void> {
    const { id, zoneCode: _zone, ...fields } = rule;
    await this.db
      .update(feeRules)
      .set({ ...fields, tiers: [...fields.tiers] })
      .where(eq(feeRules.id, id));
  }
}

/** Drizzle surge-rule repository. */
export class DrizzleSurgeRuleRepository implements SurgeRuleRepository {
  /** @param db drizzle handle */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async list(): Promise<StoredSurgeRule[]> {
    return this.db
      .select()
      .from(surgeRules)
      .orderBy(asc(surgeRules.zoneCode), asc(surgeRules.startMinute));
  }

  /** @inheritdoc */
  async activeForZone(zoneCode: string): Promise<StoredSurgeRule[]> {
    return this.db
      .select()
      .from(surgeRules)
      .where(and(eq(surgeRules.zoneCode, zoneCode), eq(surgeRules.active, true)));
  }

  /** @inheritdoc */
  async findById(id: string): Promise<StoredSurgeRule | null> {
    const [row] = await this.db.select().from(surgeRules).where(eq(surgeRules.id, id));
    return row ?? null;
  }

  /** @inheritdoc */
  async insert(rule: StoredSurgeRule): Promise<InsertOutcome> {
    const rows = await this.db
      .insert(surgeRules)
      .values({ ...rule, daysOfWeek: [...rule.daysOfWeek] })
      .onConflictDoNothing()
      .returning({ id: surgeRules.id });
    return outcome(rows);
  }

  /** @inheritdoc */
  async update(rule: StoredSurgeRule): Promise<void> {
    const { id, zoneCode: _zone, ...fields } = rule;
    await this.db
      .update(surgeRules)
      .set({ ...fields, daysOfWeek: [...fields.daysOfWeek] })
      .where(eq(surgeRules.id, id));
  }
}

/** Drizzle promo repository (counters are only changed by the redemption unit of work). */
export class DrizzlePromoRepository implements PromoRepository {
  /** @param db drizzle handle */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async list(): Promise<StoredPromo[]> {
    return this.db.select().from(promos).orderBy(asc(promos.code));
  }

  /** @inheritdoc */
  async findById(id: string): Promise<StoredPromo | null> {
    const [row] = await this.db.select().from(promos).where(eq(promos.id, id));
    return row ?? null;
  }

  /** @inheritdoc */
  async findByCode(code: string): Promise<StoredPromo | null> {
    const [row] = await this.db.select().from(promos).where(eq(promos.code, code));
    return row ?? null;
  }

  /** @inheritdoc */
  async insert(p: StoredPromo): Promise<InsertOutcome> {
    const rows = await this.db
      .insert(promos)
      .values({ ...p, activeDaysOfWeek: p.activeDaysOfWeek ? [...p.activeDaysOfWeek] : null })
      .onConflictDoNothing()
      .returning({ id: promos.id });
    return outcome(rows);
  }

  /** @inheritdoc */
  async update(p: StoredPromo): Promise<void> {
    const { id, code: _code, type: _type, redemptionCount: _n, spentMinor: _s, ...fields } = p;
    await this.db
      .update(promos)
      .set({
        ...fields,
        activeDaysOfWeek: fields.activeDaysOfWeek ? [...fields.activeDaysOfWeek] : null,
      })
      .where(eq(promos.id, id));
  }
}
