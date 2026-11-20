import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ENV, type Env } from '../../../shared/config/env.js';
import { AppError } from '../../../shared/errors/app-error.js';

/**
 * Guards internal job endpoints (called by apps/workers) with a shared token in
 * `x-internal-token`, compared in constant time. Disabled (always 403) when no token is set.
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  /** @param env config */
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** @inheritdoc */
  canActivate(context: ExecutionContext): boolean {
    const expected = Buffer.from(this.env.INTERNAL_JOBS_TOKEN);
    const header = context.switchToHttp().getRequest<Request>().header('x-internal-token');
    const given = Buffer.from(header ?? '');
    const ok =
      expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
    if (!ok) throw new AppError('forbidden', 'Not allowed.');
    return true;
  }
}
