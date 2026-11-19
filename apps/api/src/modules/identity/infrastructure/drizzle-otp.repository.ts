import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type { OtpChallengeRepository } from '../application/ports.js';
import type { OtpChallengeState } from '../domain/otp-challenge.js';
import { otpChallenges } from './identity.schema.js';

/** Drizzle adapter for {@link OtpChallengeRepository}. */
export class DrizzleOtpRepository implements OtpChallengeRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async create(state: OtpChallengeState): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(otpChallenges)
        .set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.phoneHash, state.phoneHash), isNull(otpChallenges.consumedAt)));
      await tx.insert(otpChallenges).values({ ...state });
    });
  }

  /** @inheritdoc */
  async findLatestActive(phoneHash: string): Promise<OtpChallengeState | null> {
    const rows = await this.db
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phoneHash, phoneHash), isNull(otpChallenges.consumedAt)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const { createdAt: _createdAt, ...state } = row;
    return state;
  }

  /** @inheritdoc */
  async save(state: OtpChallengeState): Promise<void> {
    await this.db
      .update(otpChallenges)
      .set({ attempts: state.attempts, consumedAt: state.consumedAt })
      .where(eq(otpChallenges.id, state.id));
  }
}
