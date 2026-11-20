import type { FeatureFlag, UpsertFeatureFlag } from '@delyva/contracts';
import type { AuditService } from './audit.service.js';
import type { FeatureFlagRepository } from './ports.js';

/** Who is changing a flag, for the audit entry. */
export interface AdminActor {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly ip: string | null;
}

/**
 * Feature flags (kill switches and gradual rollouts) read by any module. Unknown flags fall
 * back to the caller's default so a missing row never breaks a flow.
 * DEBT(admin): no per-user/percentage targeting or caching — PostHog flags are the long-term
 * home for experiments — keep this table for server kill switches only.
 */
export class FeatureFlags {
  /** @param deps storage and audit log */
  constructor(private readonly deps: { repo: FeatureFlagRepository; audit: AuditService }) {}

  /** Whether `key` is on; `fallback` when the flag does not exist. */
  async isEnabled(key: string, fallback: boolean): Promise<boolean> {
    const flag = await this.deps.repo.get(key);
    return flag ? flag.enabled : fallback;
  }

  /** All flags. */
  list(): Promise<FeatureFlag[]> {
    return this.deps.repo.list();
  }

  /** Creates or changes a flag and audits it in the same transaction. */
  upsert(actor: AdminActor, input: UpsertFeatureFlag): Promise<FeatureFlag> {
    return this.deps.repo.upsert(
      {
        key: input.key,
        enabled: input.enabled,
        description: input.description,
        updatedBy: actor.userId,
      },
      async (before, after, tx) => {
        await this.deps.audit.record(
          {
            actorId: actor.userId,
            actorRoles: actor.roles,
            action: 'feature_flag.updated',
            targetType: 'feature_flag',
            targetId: input.key,
            reason: input.reason,
            before,
            after,
            ip: actor.ip,
          },
          tx,
        );
      },
    );
  }
}
