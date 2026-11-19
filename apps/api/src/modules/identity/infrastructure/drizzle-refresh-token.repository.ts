import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type { NewRefreshToken, RefreshTokenRepository } from '../application/ports.js';
import type { RefreshTokenState } from '../domain/refresh-token.js';
import { refreshTokens } from './identity.schema.js';

/** Drizzle adapter for {@link RefreshTokenRepository}. */
export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async create(token: NewRefreshToken): Promise<void> {
    await this.db.insert(refreshTokens).values({ ...token });
  }

  /** @inheritdoc */
  async findByHash(tokenHash: string): Promise<RefreshTokenState | null> {
    const [row] = await this.db
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        familyId: refreshTokens.familyId,
        deviceId: refreshTokens.deviceId,
        expiresAt: refreshTokens.expiresAt,
        usedAt: refreshTokens.usedAt,
        revokedAt: refreshTokens.revokedAt,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return row ?? null;
  }

  /** @inheritdoc */
  async markUsed(id: string, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(refreshTokens)
      .set({ usedAt: at })
      .where(
        and(
          eq(refreshTokens.id, id),
          isNull(refreshTokens.usedAt),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id });
    return updated.length === 1;
  }

  /** @inheritdoc */
  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }
}
