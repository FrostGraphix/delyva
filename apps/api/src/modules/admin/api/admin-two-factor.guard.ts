import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ADMIN_2FA_HEADER, TWO_FACTOR_ROLES } from '@delyva/contracts';
import type { Request } from 'express';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { AdminTwoFactor } from '../application/admin-two-factor.service.js';

type AuthedRequest = Request & { principal?: AuthPrincipal };

/**
 * Requires a live admin 2FA session (`x-admin-2fa` header from POST /v1/admin/2fa/verify)
 * bound to the caller. Must run after the shared `AuthGuard`:
 * `@UseGuards(AuthGuard, AdminTwoFactorGuard)`. Callers without an admin role are rejected.
 */
@Injectable()
export class AdminTwoFactorGuard implements CanActivate {
  /** @param twoFactor 2FA service */
  constructor(private readonly twoFactor: AdminTwoFactor) {}

  /** @inheritdoc */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;
    if (!principal) throw new AppError('unauthorized', 'Not authenticated.');
    if (!principal.roles.some((r) => (TWO_FACTOR_ROLES as readonly string[]).includes(r))) {
      throw new AppError('forbidden', 'You do not have permission to perform this action.');
    }
    const token = req.header(ADMIN_2FA_HEADER);
    if (!token || !(await this.twoFactor.isSessionValid(principal.userId, token))) {
      throw new AppError('two_factor_required', 'A verified two-factor session is required.');
    }
    return true;
  }
}

/** Client IP for audit entries (DEBT(platform): needs `trust proxy` behind the load balancer). */
export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
