import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@delyva/contracts';
import type { Request } from 'express';
import { AppError } from '../errors/app-error.js';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
  type Principal,
} from './access-token.verifier.js';

const ROLES = 'delyva:roles';

/** Request carrying the verified principal. */
export type AuthenticatedRequest = Request & { principal?: Principal };

/** Restricts a handler to callers holding at least one of the roles (RBAC). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);

/** Injects the verified {@link Principal}; only valid behind {@link AuthGuard}. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new AppError('unauthorized', 'Sign in to continue.');
    return principal;
  },
);

/**
 * Verifies the `Authorization: Bearer <access JWT>` header and enforces `@Roles(...)`.
 * 401 when the token is missing/invalid, 403 when no required role is held.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  /** @param reflector Nest reflector @param verifier access-token verifier */
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
  ) {}

  /** @inheritdoc */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(req.header('authorization') ?? '');
    const principal = match?.[1] ? await this.verifier.verify(match[1]) : null;
    if (!principal) throw new AppError('unauthorized', 'Sign in to continue.');
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !required.some((r) => principal.roles.includes(r))) {
      throw new AppError('forbidden', 'You do not have access to this resource.');
    }
    req.principal = principal;
    return true;
  }
}
