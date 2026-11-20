import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../errors/app-error.js';
import type { Principal } from './access-token.verifier.js';
import type { AuthenticatedRequest } from './auth.guard.js';

const OWNED_PARAM = 'delyva:owned-param';

/** Answers "may this principal act on resource `id`?" for one resource type. */
export interface OwnershipChecker {
  /** True when the principal owns (or is a member of) the resource. */
  canAccess(principal: Principal, resourceId: string): Promise<boolean>;
}

/** DI token for the module-local {@link OwnershipChecker}. Each module provides its own. */
export const OWNERSHIP_CHECKER = Symbol('OWNERSHIP_CHECKER');

/** Declares which route param identifies the owned resource, e.g. `@OwnsResource('vendorId')`. */
export const OwnsResource = (param: string): MethodDecorator & ClassDecorator =>
  SetMetadata(OWNED_PARAM, param);

/**
 * Ownership guard (IDOR defence). Runs after {@link AuthGuard}; resolves the route param named by
 * `@OwnsResource` and asks the module's {@link OwnershipChecker}. Unknown or foreign resources both
 * yield 403 so ids cannot be probed. Use cases re-check ownership (defence in depth).
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  /** @param reflector Nest reflector @param checker module ownership checker */
  constructor(
    private readonly reflector: Reflector,
    @Inject(OWNERSHIP_CHECKER) private readonly checker: OwnershipChecker,
  ) {}

  /** @inheritdoc */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const param = this.reflector.getAllAndOverride<string | undefined>(OWNED_PARAM, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!param) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const id = req.params[param];
    if (!req.principal || typeof id !== 'string') {
      throw new AppError('forbidden', 'You do not have access to this resource.');
    }
    if (!(await this.checker.canAccess(req.principal, id))) {
      throw new AppError('forbidden', 'You do not have access to this resource.');
    }
    return true;
  }
}
