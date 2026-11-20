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

/** Authenticated caller derived from a verified access token. */
export interface AuthPrincipal {
  readonly userId: string;
  readonly roles: readonly string[];
}

/** Verifies a raw access token; rejects (throws) when invalid or expired. */
export interface AccessTokenVerifier {
  /** @returns the principal encoded in the token */
  verify(token: string): Promise<AuthPrincipal>;
}

/** DI token for the {@link AccessTokenVerifier} a module provides to {@link AuthGuard}. */
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

const ROLES_KEY = 'delyva:roles';

/** Restricts a handler/controller to callers holding at least one of `roles`. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

type AuthedRequest = Request & { principal?: AuthPrincipal };

function bearerToken(req: Request): string | null {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Requires a valid Bearer access token (401 otherwise) and, when `@Roles(...)` is present,
 * one of the listed roles (403 otherwise). Attaches the principal to the request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  /** @param reflector Nest reflector @param verifier token verifier */
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
  ) {}

  /** @inheritdoc */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req);
    if (!token) throw new AppError('unauthorized', 'A Bearer access token is required.');
    const principal = await this.verifier.verify(token).catch(() => {
      throw new AppError('unauthorized', 'The access token is invalid or expired.');
    });
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !required.some((r) => principal.roles.includes(r))) {
      throw new AppError('forbidden', 'You do not have permission to perform this action.');
    }
    req.principal = principal;
    return true;
  }
}

/** Injects the {@link AuthPrincipal} set by {@link AuthGuard}. */
export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const principal = ctx.switchToHttp().getRequest<AuthedRequest>().principal;
    if (!principal) throw new AppError('unauthorized', 'Not authenticated.');
    return principal;
  },
);
