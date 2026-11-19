import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  type LogoutRequest,
  LogoutRequestSchema,
  type OtpRequest,
  type OtpRequestResponse,
  OtpRequestSchema,
  type OtpVerify,
  OtpVerifySchema,
  type RefreshRequest,
  RefreshRequestSchema,
  type TokenPair,
} from '@delyva/contracts';
import type { Request } from 'express';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { Logout } from '../application/logout.use-case.js';
import { RefreshSession } from '../application/refresh-session.use-case.js';
import { RequestOtp } from '../application/request-otp.use-case.js';
import { VerifyOtp } from '../application/verify-otp.use-case.js';
import { JoseAccessTokenSigner } from '../infrastructure/jose-access-token.signer.js';

const clientIp = (req: Request): string => req.ip ?? 'unknown';

/** Phone + OTP authentication endpoints (v1). */
@Controller()
export class AuthController {
  /** Injected use cases. */
  constructor(
    private readonly requestOtp: RequestOtp,
    private readonly verifyOtp: VerifyOtp,
    private readonly refreshSession: RefreshSession,
    private readonly logoutUseCase: Logout,
    private readonly signer: JoseAccessTokenSigner,
  ) {}

  /** POST /v1/auth/otp/request — sends an OTP. Requires Idempotency-Key. */
  @Post('v1/auth/otp/request')
  @HttpCode(202)
  @Idempotent()
  request(
    @Body(new ZodBodyPipe(OtpRequestSchema)) body: OtpRequest,
    @Req() req: Request,
  ): Promise<OtpRequestResponse> {
    return this.requestOtp.execute({ phone: body.phone, ip: clientIp(req) });
  }

  /** POST /v1/auth/otp/verify — verifies and issues tokens. */
  @Post('v1/auth/otp/verify')
  @HttpCode(200)
  verify(
    @Body(new ZodBodyPipe(OtpVerifySchema)) body: OtpVerify,
    @Req() req: Request,
  ): Promise<TokenPair> {
    return this.verifyOtp.execute({ ...body, ip: clientIp(req) });
  }

  /** POST /v1/auth/refresh — rotates the refresh token. */
  @Post('v1/auth/refresh')
  @HttpCode(200)
  refresh(@Body(new ZodBodyPipe(RefreshRequestSchema)) body: RefreshRequest): Promise<TokenPair> {
    return this.refreshSession.execute(body);
  }

  /** POST /v1/auth/logout — revokes the token family. */
  @Post('v1/auth/logout')
  @HttpCode(204)
  async logout(@Body(new ZodBodyPipe(LogoutRequestSchema)) body: LogoutRequest): Promise<void> {
    await this.logoutUseCase.execute(body);
  }

  /** GET /.well-known/jwks.json — public signing keys. */
  @Get('.well-known/jwks.json')
  jwks(): Promise<{ keys: object[] }> {
    return this.signer.jwks();
  }
}
