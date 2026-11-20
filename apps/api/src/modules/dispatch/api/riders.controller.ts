import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  type CurrentTrip,
  type RiderAvailabilityRequest,
  RiderAvailabilityRequestSchema,
  type RiderEarnings,
  type RiderProfile,
} from '@delyva/contracts';
import {
  type AuthPrincipal,
  AuthGuard,
  Principal,
  Roles,
} from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { RiderSelfService } from '../application/rider-availability.use-cases.js';

/** Rider self-service endpoints (role `rider`). */
@Controller('v1/riders/me')
@UseGuards(AuthGuard)
@Roles('rider')
export class RidersController {
  /** @param riders rider use cases */
  constructor(private readonly riders: RiderSelfService) {}

  /** GET /v1/riders/me */
  @Get()
  profile(@Principal() me: AuthPrincipal): Promise<RiderProfile> {
    return this.riders.profile(me);
  }

  /** POST /v1/riders/me/online (Idempotency-Key required) */
  @Post('online')
  @HttpCode(200)
  @Idempotent()
  online(
    @Principal() me: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderAvailabilityRequestSchema)) body: RiderAvailabilityRequest,
  ): Promise<RiderProfile> {
    return this.riders.goOnline(me, body.batteryPct);
  }

  /** POST /v1/riders/me/offline (Idempotency-Key required) */
  @Post('offline')
  @HttpCode(200)
  @Idempotent()
  offline(
    @Principal() me: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderAvailabilityRequestSchema)) body: RiderAvailabilityRequest,
  ): Promise<RiderProfile> {
    return this.riders.goOffline(me, body.batteryPct);
  }

  /** GET /v1/riders/me/trips/current */
  @Get('trips/current')
  currentTrip(@Principal() me: AuthPrincipal): Promise<CurrentTrip> {
    return this.riders.currentTrip(me);
  }

  /** GET /v1/riders/me/earnings */
  @Get('earnings')
  earnings(@Principal() me: AuthPrincipal): Promise<RiderEarnings> {
    return this.riders.earnings(me);
  }
}
