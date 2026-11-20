import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { type DispatchOffer, IdParamSchema, type Trip } from '@delyva/contracts';
import {
  type AuthPrincipal,
  AuthGuard,
  Principal,
  Roles,
} from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { RespondToOffer } from '../application/respond-to-offer.use-cases.js';

const idPipe = new ZodBodyPipe(IdParamSchema);

/** Rider responses to job offers (role `rider`; other riders' offers are 404). */
@Controller('v1/dispatch-offers')
@UseGuards(AuthGuard)
@Roles('rider')
export class DispatchOffersController {
  /** @param offers offer commands */
  constructor(private readonly offers: RespondToOffer) {}

  /** POST /v1/dispatch-offers/{id}/accept (Idempotency-Key required) */
  @Post(':id/accept')
  @HttpCode(200)
  @Idempotent()
  accept(@Principal() me: AuthPrincipal, @Param('id', idPipe) id: string): Promise<Trip> {
    return this.offers.accept(me, id);
  }

  /** POST /v1/dispatch-offers/{id}/decline (Idempotency-Key required) */
  @Post(':id/decline')
  @HttpCode(200)
  @Idempotent()
  decline(@Principal() me: AuthPrincipal, @Param('id', idPipe) id: string): Promise<DispatchOffer> {
    return this.offers.decline(me, id);
  }
}
