import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ArrivedAtVendorSchema,
  DeliveredSchema,
  IdParamSchema,
  type Trip,
  TripActionSchema,
  UndeliverableSchema,
} from '@delyva/contracts';
import type { z } from 'zod';
import {
  type AuthPrincipal,
  AuthGuard,
  Principal,
  Roles,
} from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { PerformTripAction } from '../application/trip-actions.use-case.js';

const idPipe = new ZodBodyPipe(IdParamSchema);

/**
 * Rider trip actions (role `rider`, own trips only). All take an `Idempotency-Key` so the rider
 * app can queue them offline and replay; replays return the stored response.
 */
@Controller('v1/trips')
@UseGuards(AuthGuard)
@Roles('rider')
export class TripsController {
  /** @param actions trip command */
  constructor(private readonly actions: PerformTripAction) {}

  /** POST /v1/trips/{id}/arrived-at-vendor */
  @Post(':id/arrived-at-vendor')
  @HttpCode(200)
  @Idempotent()
  arrivedAtVendor(
    @Principal() me: AuthPrincipal,
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(ArrivedAtVendorSchema)) body: z.output<typeof ArrivedAtVendorSchema>,
  ): Promise<Trip> {
    return this.actions.execute(me, id, 'arrived_at_vendor', body);
  }

  /** POST /v1/trips/{id}/picked-up */
  @Post(':id/picked-up')
  @HttpCode(200)
  @Idempotent()
  pickedUp(
    @Principal() me: AuthPrincipal,
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(TripActionSchema)) body: z.output<typeof TripActionSchema>,
  ): Promise<Trip> {
    return this.actions.execute(me, id, 'picked_up', body);
  }

  /** POST /v1/trips/{id}/arrived-at-customer */
  @Post(':id/arrived-at-customer')
  @HttpCode(200)
  @Idempotent()
  arrivedAtCustomer(
    @Principal() me: AuthPrincipal,
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(TripActionSchema)) body: z.output<typeof TripActionSchema>,
  ): Promise<Trip> {
    return this.actions.execute(me, id, 'arrived_at_customer', body);
  }

  /** POST /v1/trips/{id}/delivered */
  @Post(':id/delivered')
  @HttpCode(200)
  @Idempotent()
  delivered(
    @Principal() me: AuthPrincipal,
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(DeliveredSchema)) body: z.output<typeof DeliveredSchema>,
  ): Promise<Trip> {
    return this.actions.execute(me, id, 'delivered', body);
  }

  /** POST /v1/trips/{id}/undeliverable */
  @Post(':id/undeliverable')
  @HttpCode(200)
  @Idempotent()
  undeliverable(
    @Principal() me: AuthPrincipal,
    @Param('id', idPipe) id: string,
    @Body(new ZodBodyPipe(UndeliverableSchema)) body: z.output<typeof UndeliverableSchema>,
  ): Promise<Trip> {
    return this.actions.execute(me, id, 'undeliverable', body);
  }
}
