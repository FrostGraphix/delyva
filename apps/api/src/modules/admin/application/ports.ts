import type { FeatureFlag } from '@delyva/contracts';

/** One immutable audit entry. */
export interface AuditEntry {
  readonly actorId: string;
  readonly actorRoles: readonly string[];
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly ip: string | null;
}

/**
 * Transaction handle an audit entry may be written in (a Drizzle db or tx), so the entry
 * commits atomically with the change it describes.
 */
export type AuditTx = unknown;

/** Append-only audit storage (UPDATE/DELETE/TRUNCATE are rejected by DB triggers). */
export interface AuditRepository {
  /** Appends an entry, optionally inside the caller's transaction; returns its id. */
  append(entry: AuditEntry, tx?: AuditTx): Promise<string>;
}

/** Feature flag storage. */
export interface FeatureFlagRepository {
  /** All flags by key. */
  list(): Promise<FeatureFlag[]>;
  /** One flag or null. */
  get(key: string): Promise<FeatureFlag | null>;
  /** Upserts and returns the new row plus the previous one; the audit entry joins the same tx. */
  upsert(
    input: { key: string; enabled: boolean; description: string | undefined; updatedBy: string },
    audit: (before: FeatureFlag | null, after: FeatureFlag, tx: AuditTx) => Promise<void>,
  ): Promise<FeatureFlag>;
}

/** Stored TOTP factor of an admin user (secret encrypted at rest). */
export interface TotpFactor {
  readonly userId: string;
  readonly secretCiphertext: string;
  readonly confirmedAt: Date | null;
  readonly lastUsedStep: number | null;
}

/** TOTP factor storage. */
export interface TotpFactorRepository {
  /** Factor of a user, or null. */
  find(userId: string): Promise<TotpFactor | null>;
  /** Creates or replaces an unconfirmed factor; false when a confirmed one exists. */
  saveUnconfirmed(userId: string, secretCiphertext: string): Promise<boolean>;
  /**
   * Atomically records `step` as used (and confirms the factor) only if it is newer than the
   * last used step. False means a replay or a concurrent use of the same code.
   */
  consumeStep(userId: string, step: number, confirm: boolean): Promise<boolean>;
}

/** Short-lived admin 2FA sessions (Redis). Tokens are stored hashed. */
export interface TwoFactorSessionStore {
  /** Stores a session for `ttlSeconds`. */
  create(tokenHash: string, userId: string, ttlSeconds: number): Promise<void>;
  /** User id bound to the session, or null when missing/expired. */
  userOf(tokenHash: string): Promise<string | null>;
  /** Counts a verification attempt; false when over the limit. */
  allowAttempt(userId: string): Promise<boolean>;
}

/** Encrypts small secrets bound to a context (shared FieldEncryptor). */
export interface SecretCipher {
  /** Encrypt. */
  encrypt(plaintext: string, context: string): string;
  /** Decrypt. */
  decrypt(envelope: string, context: string): string;
}

/** Clock and randomness, injectable for tests. */
export interface AdminClock {
  /** Epoch milliseconds. */
  nowMs(): number;
  /** Cryptographically random bytes. */
  randomBytes(n: number): Buffer;
}
