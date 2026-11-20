import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Env } from '../../shared/config/env.js';
import {
  ACCESS_TOKEN_VERIFIER,
  JoseAccessTokenVerifier,
} from '../../shared/auth/access-token.verifier.js';
import { ENV } from '../../shared/config/env.js';
import { DB, type Db } from '../../shared/database/database.js';
import { REDIS } from '../../shared/redis/redis.js';
import { AuthController } from './api/auth.controller.js';
import { Logout } from './application/logout.use-case.js';
import type { Clock, SecretHasher, SmsSender } from './application/ports.js';
import { RefreshSession } from './application/refresh-session.use-case.js';
import { RequestOtp } from './application/request-otp.use-case.js';
import { SessionIssuer } from './application/session-issuer.js';
import { VerifyOtp } from './application/verify-otp.use-case.js';
import { CryptoSecretHasher } from './infrastructure/crypto-secret.hasher.js';
import { DrizzleOtpRepository } from './infrastructure/drizzle-otp.repository.js';
import { DrizzleRefreshTokenRepository } from './infrastructure/drizzle-refresh-token.repository.js';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository.js';
import { JoseAccessTokenSigner } from './infrastructure/jose-access-token.signer.js';
import { RedisRateLimiter } from './infrastructure/redis-rate-limiter.js';
import { DevSmsSender, TermiiSmsSender } from './infrastructure/sms.senders.js';

const HASHER = Symbol('HASHER');
const SMS = Symbol('SMS');
const CLOCK = Symbol('CLOCK');

const systemClock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

function smsFor(env: Env, redis: Redis): SmsSender {
  if (env.SMS_PROVIDER === 'termii') {
    return new TermiiSmsSender({
      apiKey: env.TERMII_API_KEY,
      senderId: env.TERMII_SENDER_ID,
      baseUrl: env.TERMII_BASE_URL,
    });
  }
  return new DevSmsSender(redis);
}

/** Identity bounded context: users, OTP, sessions. */
@Module({
  controllers: [AuthController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: HASHER,
      inject: [ENV],
      useFactory: (env: Env) => new CryptoSecretHasher(env.HASH_PEPPER),
    },
    { provide: SMS, inject: [ENV, REDIS], useFactory: smsFor },
    {
      provide: JoseAccessTokenSigner,
      inject: [ENV],
      useFactory: (env: Env) =>
        new JoseAccessTokenSigner({
          privateKeyPemB64: env.JWT_PRIVATE_KEY_PEM_B64,
          keyId: env.JWT_KEY_ID,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }),
    },
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [ENV, JoseAccessTokenSigner],
      useFactory: (env: Env, signer: JoseAccessTokenSigner) =>
        new JoseAccessTokenVerifier({
          key: signer.verificationKey,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }),
    },
    {
      provide: DrizzleOtpRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleOtpRepository(db),
    },
    {
      provide: DrizzleUserRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleUserRepository(db),
    },
    {
      provide: DrizzleRefreshTokenRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleRefreshTokenRepository(db),
    },
    {
      provide: RedisRateLimiter,
      inject: [REDIS],
      useFactory: (r: Redis) => new RedisRateLimiter(r),
    },
    {
      provide: SessionIssuer,
      inject: [DrizzleRefreshTokenRepository, JoseAccessTokenSigner, HASHER, CLOCK],
      useFactory: (
        refreshTokens: DrizzleRefreshTokenRepository,
        signer: JoseAccessTokenSigner,
        hasher: SecretHasher,
        clock: Clock,
      ) => new SessionIssuer({ refreshTokens, signer, hasher, clock }),
    },
    {
      provide: RequestOtp,
      inject: [DrizzleOtpRepository, SMS, HASHER, RedisRateLimiter, CLOCK],
      useFactory: (
        otps: DrizzleOtpRepository,
        sms: SmsSender,
        hasher: SecretHasher,
        limiter: RedisRateLimiter,
        clock: Clock,
      ) => new RequestOtp({ otps, sms, hasher, limiter, clock }),
    },
    {
      provide: VerifyOtp,
      inject: [
        DrizzleOtpRepository,
        DrizzleUserRepository,
        HASHER,
        RedisRateLimiter,
        CLOCK,
        SessionIssuer,
      ],
      useFactory: (
        otps: DrizzleOtpRepository,
        users: DrizzleUserRepository,
        hasher: SecretHasher,
        limiter: RedisRateLimiter,
        clock: Clock,
        sessions: SessionIssuer,
      ) => new VerifyOtp({ otps, users, hasher, limiter, clock, sessions }),
    },
    {
      provide: RefreshSession,
      inject: [DrizzleRefreshTokenRepository, DrizzleUserRepository, HASHER, CLOCK, SessionIssuer],
      useFactory: (
        refreshTokens: DrizzleRefreshTokenRepository,
        users: DrizzleUserRepository,
        hasher: SecretHasher,
        clock: Clock,
        sessions: SessionIssuer,
      ) => new RefreshSession({ refreshTokens, users, hasher, clock, sessions }),
    },
    {
      provide: Logout,
      inject: [DrizzleRefreshTokenRepository, HASHER, CLOCK],
      useFactory: (
        refreshTokens: DrizzleRefreshTokenRepository,
        hasher: SecretHasher,
        clock: Clock,
      ) => new Logout({ refreshTokens, hasher, clock }),
    },
  ],
  exports: [JoseAccessTokenSigner, ACCESS_TOKEN_VERIFIER],
})
export class IdentityModule {}
