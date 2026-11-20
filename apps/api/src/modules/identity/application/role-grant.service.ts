import type { Role } from '@delyva/contracts';
import type { RoleStore } from './ports.js';

/** Raised when the user to grant a role to does not exist. */
export class UnknownUserError extends Error {
  /** Stable problem code. */
  readonly code = 'not_found' as const;
  /** @param message safe message */
  constructor(message = 'User not found.') {
    super(message);
    this.name = 'UnknownUserError';
  }
}

/**
 * Public identity interface for granting roles (e.g. `rider` after onboarding approval).
 * Idempotent. Callers are responsible for authorisation and for writing the audit entry.
 * New roles appear in access tokens issued from the next refresh (≤ 15 min).
 */
export class RoleGrantService {
  /** @param roles role storage */
  constructor(private readonly roles: RoleStore) {}

  /** Grants `role` to the user. @throws UnknownUserError (not_found) */
  async grant(userId: string, role: Role): Promise<{ roles: string[]; added: boolean }> {
    const result = await this.roles.addRole(userId, role);
    if (!result) throw new UnknownUserError();
    return result;
  }
}
