import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { ENV, type Env } from '../../../shared/config/env.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { JoseAccessTokenSigner } from '../../identity/infrastructure/jose-access-token.signer.js';

/** Authenticated principal attached to the request. */
export interface Principal {
  readonly userId: string;
  readonly roles: readonly string[];
}

type AuthedRequest = Request & { principal?: Principal };

/**
 * Verifies the EdDSA access JWT (issuer, audience, expiry) issued by the identity context.
 * DEBT(platform): bearer guard lives in payments until a shared RBAC guard exists — first protected routes — move to src/shared/auth with role checks.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  /** @param signer identity signer (public key) @param env config */
  constructor(
    private readonly signer: JoseAccessTokenSigner,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** @inheritdoc */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(req.header('authorization') ?? '');
    if (!match?.[1]) throw new AppError('unauthorized', 'A valid access token is required.');
    try {
      const { payload } = await jwtVerify(match[1], this.signer.verificationKey, {
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        algorithms: ['EdDSA'],
      });
      if (typeof payload.sub !== 'string') throw new Error('no subject');
      const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
      req.principal = { userId: payload.sub, roles };
      return true;
    } catch {
      throw new AppError('unauthorized', 'A valid access token is required.');
    }
  }
}

/** Injects the authenticated {@link Principal}. Only valid behind {@link BearerAuthGuard}. */
export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<AuthedRequest>().principal;
    if (!principal) throw new AppError('unauthorized', 'A valid access token is required.');
    return principal;
  },
);

/** Guards internal job endpoints with a shared token (`x-internal-token`), compared in constant time. */
@Injectable()
export class InternalJobGuard implements CanActivate {
  /** @param env config */
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** @inheritdoc */
  canActivate(context: ExecutionContext): boolean {
    const expected = Buffer.from(this.env.INTERNAL_JOBS_TOKEN);
    const given = Buffer.from(
      context.switchToHttp().getRequest<Request>().header('x-internal-token') ?? '',
    );
    if (
      expected.length === 0 ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    ) {
      throw new AppError('forbidden', 'Not allowed.');
    }
    return true;
  }
}
