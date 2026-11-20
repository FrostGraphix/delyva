import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../errors/app-error.js';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
  bearerToken,
  type Principal,
} from './access-token.verifier.js';

type AuthedRequest = Request & { principal?: Principal };

/** Requires a valid bearer access token; attaches the {@link Principal} to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  /** @param verifier access-token verifier */
  constructor(@Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier) {}

  /** @inheritdoc */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req.header('authorization'));
    if (!token) throw new AppError('unauthorized', 'A valid access token is required.');
    req.principal = await this.verifier.verify(token);
    return true;
  }
}

/** Injects the authenticated {@link Principal} (use only behind {@link AuthGuard}). */
export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = ctx.switchToHttp().getRequest<AuthedRequest>().principal;
  if (!principal) throw new AppError('unauthorized', 'A valid access token is required.');
  return principal;
});
