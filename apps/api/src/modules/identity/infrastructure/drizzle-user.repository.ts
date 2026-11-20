import { randomUUID } from 'node:crypto';
import type { UserRegisteredPayload } from '@delyva/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type { RoleStore, UserRepository } from '../application/ports.js';
import { users } from './identity.schema.js';

/** Drizzle adapter for {@link UserRepository}. */
export class DrizzleUserRepository implements UserRepository, RoleStore {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async findOrCreateByPhone(
    phone: string,
    phoneHash: string,
  ): Promise<{ userId: string; roles: string[]; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({ id: randomUUID(), phone, phoneHash })
        .onConflictDoNothing({ target: users.phoneHash })
        .returning({ id: users.id, roles: users.roles });
      const created = inserted[0];
      if (created) {
        await appendToOutbox<UserRegisteredPayload>(tx, {
          type: 'identity.user.registered',
          aggregateType: 'user',
          aggregateId: created.id,
          payload: { userId: created.id },
        });
        return { userId: created.id, roles: created.roles, created: true };
      }
      const [existing] = await tx
        .select({ id: users.id, roles: users.roles })
        .from(users)
        .where(eq(users.phoneHash, phoneHash));
      if (!existing) throw new Error('user upsert race: row missing after conflict');
      return { userId: existing.id, roles: existing.roles, created: false };
    });
  }

  /** @inheritdoc */
  async addRole(userId: string, role: string): Promise<{ roles: string[]; added: boolean } | null> {
    const updated = await this.db
      .update(users)
      .set({ roles: sql`array_append(${users.roles}, ${role})` })
      .where(and(eq(users.id, userId), sql`NOT (${role} = ANY(${users.roles}))`))
      .returning({ roles: users.roles });
    if (updated[0]) return { roles: updated[0].roles, added: true };
    const [existing] = await this.db
      .select({ roles: users.roles })
      .from(users)
      .where(eq(users.id, userId));
    return existing ? { roles: existing.roles, added: false } : null;
  }

  /** @inheritdoc */
  async rolesOf(userId: string): Promise<string[]> {
    const [row] = await this.db
      .select({ roles: users.roles })
      .from(users)
      .where(eq(users.id, userId));
    return row?.roles ?? [];
  }
}
