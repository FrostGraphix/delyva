import type { OtpChallengeState } from '../domain/otp-challenge.js';
import type { RefreshTokenState } from '../domain/refresh-token.js';

/** Persistence for OTP challenges. */
export interface OtpChallengeRepository {
  /** Stores a new challenge, invalidating older active challenges for the phone. */
  create(state: OtpChallengeState): Promise<void>;
  /** Latest unconsumed challenge for a phone hash. */
  findLatestActive(phoneHash: string): Promise<OtpChallengeState | null>;
  /** Persists attempts / consumption. */
  save(state: OtpChallengeState): Promise<void>;
}

/** Persistence for users. */
export interface UserRepository {
  /** Finds or creates a user by phone; creation emits `identity.user.registered` via the outbox atomically. */
  findOrCreateByPhone(
    phone: string,
    phoneHash: string,
  ): Promise<{ userId: string; roles: string[]; created: boolean }>;
  /** Roles for a user. */
  rolesOf(userId: string): Promise<string[]>;
}

/** Role assignment storage (roles live on the user row). */
export interface RoleStore {
  /** Adds `role` if missing; null when the user does not exist. */
  addRole(userId: string, role: string): Promise<{ roles: string[]; added: boolean } | null>;
}

/** New refresh token row. */
export interface NewRefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly deviceId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Persistence for refresh tokens. */
export interface RefreshTokenRepository {
  /** Inserts a token. */
  create(token: NewRefreshToken): Promise<void>;
  /** Finds by hash. */
  findByHash(tokenHash: string): Promise<RefreshTokenState | null>;
  /** Marks used only if still unused; returns false when another request won the race. */
  markUsed(id: string, at: Date): Promise<boolean>;
  /** Revokes every token in the family. */
  revokeFamily(familyId: string, at: Date): Promise<void>;
}

/** Sends OTP SMS. Implementations must never log the code. */
export interface SmsSender {
  /** Delivers the code to the phone. */
  sendOtp(phone: string, code: string): Promise<void>;
}

/** Peppered hashing and secure randomness. */
export interface SecretHasher {
  /** Deterministic keyed hash (HMAC-SHA256 with server pepper), hex. */
  hash(value: string): string;
  /** Constant-time equality for hex hashes. */
  equals(a: string, b: string): boolean;
  /** Uniform random numeric code of the given length. */
  randomDigits(length: number): string;
  /** Opaque URL-safe random token (256 bits). */
  randomToken(): string;
}

/** Signs short-lived access tokens. */
export interface AccessTokenSigner {
  /** Signs an access JWT; returns token and lifetime in seconds. */
  sign(claims: {
    userId: string;
    roles: string[];
    deviceId: string;
  }): Promise<{ token: string; expiresIn: number }>;
}

/** Sliding-window rate limiter. */
export interface RateLimiter {
  /** Records a hit; returns whether it is allowed. */
  hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

/** Clock and id source, injectable for tests. */
export interface Clock {
  /** Current time. */
  now(): Date;
  /** New UUID v4. */
  uuid(): string;
}
