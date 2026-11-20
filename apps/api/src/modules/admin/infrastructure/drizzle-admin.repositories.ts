import { randomUUID } from 'node:crypto';
import type { FeatureFlag } from '@delyva/contracts';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Db } from '../../../shared/database/database.js';
import { slidingWindowHit } from '../../../shared/rate-limit/sliding-window.js';
import type {
  AuditEntry,
  AuditRepository,
  AuditTx,
  FeatureFlagRepository,
  TotpFactor,
  TotpFactorRepository,
  TwoFactorSessionStore,
} from '../application/ports.js';
import { adminTotpFactors, auditLog, featureFlags } from './admin.schema.js';

type Inserter = Pick<Db, 'insert'>;

/** Drizzle append-only audit storage. */
export class DrizzleAuditRepository implements AuditRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async append(entry: AuditEntry, tx?: AuditTx): Promise<string> {
    const id = randomUUID();
    const target = (tx as Inserter | undefined) ?? this.db;
    await target.insert(auditLog).values({
      id,
      actorId: entry.actorId,
      actorRoles: [...entry.actorRoles],
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip,
    });
    return id;
  }
}

const toFlag = (r: typeof featureFlags.$inferSelect): FeatureFlag => ({
  key: r.key,
  enabled: r.enabled,
  description: r.description,
  updatedBy: r.updatedBy,
  updatedAt: r.updatedAt.toISOString(),
});

/** Drizzle feature flag storage. */
export class DrizzleFeatureFlagRepository implements FeatureFlagRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async list(): Promise<FeatureFlag[]> {
    return (await this.db.select().from(featureFlags).orderBy(asc(featureFlags.key))).map(toFlag);
  }

  /** @inheritdoc */
  async get(key: string): Promise<FeatureFlag | null> {
    const [row] = await this.db.select().from(featureFlags).where(eq(featureFlags.key, key));
    return row ? toFlag(row) : null;
  }

  /** @inheritdoc */
  async upsert(
    input: { key: string; enabled: boolean; description: string | undefined; updatedBy: string },
    audit: (before: FeatureFlag | null, after: FeatureFlag, tx: AuditTx) => Promise<void>,
  ): Promise<FeatureFlag> {
    return this.db.transaction(async (tx) => {
      const [prev] = await tx
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, input.key))
        .for('update');
      const values = {
        enabled: input.enabled,
        description: input.description ?? prev?.description ?? '',
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(featureFlags)
        .values({ key: input.key, ...values })
        .onConflictDoUpdate({ target: featureFlags.key, set: values })
        .returning();
      if (!row) throw new Error('feature flag upsert returned no row');
      const after = toFlag(row);
      await audit(prev ? toFlag(prev) : null, after, tx);
      return after;
    });
  }
}

/** Drizzle TOTP factor storage. */
export class DrizzleTotpFactorRepository implements TotpFactorRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async find(userId: string): Promise<TotpFactor | null> {
    const [row] = await this.db
      .select()
      .from(adminTotpFactors)
      .where(eq(adminTotpFactors.userId, userId));
    return row
      ? {
          userId: row.userId,
          secretCiphertext: row.secretCiphertext,
          confirmedAt: row.confirmedAt,
          lastUsedStep: row.lastUsedStep,
        }
      : null;
  }

  /** @inheritdoc */
  async saveUnconfirmed(userId: string, secretCiphertext: string): Promise<boolean> {
    const rows = await this.db
      .insert(adminTotpFactors)
      .values({ userId, secretCiphertext })
      .onConflictDoUpdate({
        target: adminTotpFactors.userId,
        set: { secretCiphertext, lastUsedStep: null, updatedAt: sql`now()` },
        setWhere: isNull(adminTotpFactors.confirmedAt),
      })
      .returning({ userId: adminTotpFactors.userId });
    return rows.length > 0;
  }

  /** @inheritdoc */
  async consumeStep(userId: string, step: number, confirm: boolean): Promise<boolean> {
    const rows = await this.db
      .update(adminTotpFactors)
      .set({
        lastUsedStep: step,
        updatedAt: sql`now()`,
        ...(confirm ? { confirmedAt: sql`now()` } : {}),
      })
      .where(
        and(
          eq(adminTotpFactors.userId, userId),
          or(isNull(adminTotpFactors.lastUsedStep), lt(adminTotpFactors.lastUsedStep, step)),
        ),
      )
      .returning({ userId: adminTotpFactors.userId });
    return rows.length > 0;
  }
}

/** Redis-backed 2FA sessions and attempt limits (5 per 5 minutes per user). */
export class RedisTwoFactorSessions implements TwoFactorSessionStore {
  /** @param redis shared redis */
  constructor(private readonly redis: Redis) {}

  /** @inheritdoc */
  async create(tokenHash: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`admin2fa:sess:${tokenHash}`, userId, 'EX', ttlSeconds);
  }

  /** @inheritdoc */
  userOf(tokenHash: string): Promise<string | null> {
    return this.redis.get(`admin2fa:sess:${tokenHash}`);
  }

  /** @inheritdoc */
  async allowAttempt(userId: string): Promise<boolean> {
    return (await slidingWindowHit(this.redis, `rl:admin2fa:${userId}`, 5, 300)).allowed;
  }
}
