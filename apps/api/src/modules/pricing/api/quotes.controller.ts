import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { type QuoteRequest, QuoteRequestSchema, type QuoteResponse } from '@delyva/contracts';
import { AuthGuard, type AuthPrincipal, Principal } from '../../../shared/auth/auth.guard.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { PricingService } from '../application/pricing.service.js';
import { toQuoteResponse } from './pricing.mappers.js';

/** Customer price quotes (v1). Read-only: no Idempotency-Key needed. */
@Controller()
@UseGuards(AuthGuard)
export class QuotesController {
  /** @param pricing pricing service */
  constructor(private readonly pricing: PricingService) {}

  /**
   * POST /v1/quotes — itemised, server-computed price breakdown.
   * DEBT(pricing): line unit prices come from the request — catalog context not built yet — resolve prices from catalog by item id; ordering must re-quote with catalog prices before charging.
   */
  @Post('v1/quotes')
  @HttpCode(200)
  async create(
    @Body(new ZodBodyPipe(QuoteRequestSchema)) body: QuoteRequest,
    @Principal() principal: AuthPrincipal,
  ): Promise<QuoteResponse> {
    const result = await this.pricing.quote({ ...body, userId: principal.userId });
    return toQuoteResponse(result);
  }
}
