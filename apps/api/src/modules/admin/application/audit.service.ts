import type { AuditEntry, AuditRepository, AuditTx } from './ports.js';

/**
 * Public admin interface for the immutable audit log. Any module records admin actions that
 * change roles, money or approval state here — ideally inside the same transaction as the
 * change (`tx`), so the log can never miss a committed action. Entries are append-only at the
 * database level (triggers + revoked privileges); corrections are new entries.
 */
export class AuditService {
  /** @param repo append-only storage */
  constructor(private readonly repo: AuditRepository) {}

  /** Records an entry; returns its id. Never put secrets or raw PII in before/after. */
  record(entry: AuditEntry, tx?: AuditTx): Promise<string> {
    if (entry.action.trim() === '' || entry.targetId.trim() === '') {
      return Promise.reject(new Error('audit entry needs an action and a target'));
    }
    return this.repo.append(entry, tx);
  }
}
