import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { type LocationBatchResult, RiderLocationBatchSchema } from '@delyva/contracts';
import type { z } from 'zod';
import { type AuthPrincipal, AuthGuard, Principal } from '../../../shared/auth/auth.guard.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { LIVE_TRACKING, type LiveTrackingService } from '../application/live-tracking.service.js';
import type { LocationRateLimiter } from '../application/ports.js';
import { HTTP_BATCH_LIMIT, isRider } from '../domain/location-policy.js';
import { RedisLocationRateLimiter } from '../infrastructure/redis-location.store.js';

/**
 * HTTP fallback for rider locations when the socket is down. Location writes are idempotent by
 * timestamp (older/equal fixes are ignored), so no Idempotency-Key is required.
 */
@Controller()
@UseGuards(AuthGuard)
export class RiderLocationsController {
  /** Injected collaborators. */
  constructor(
    @Inject(LIVE_TRACKING) private readonly tracking: LiveTrackingService,
    @Inject(RedisLocationRateLimiter) private readonly limiter: LocationRateLimiter,
  ) {}

  /** POST /v1/riders/me/locations */
  @Post('v1/riders/me/locations')
  @HttpCode(202)
  async post(
    @Principal() me: AuthPrincipal,
    @Body(new ZodBodyPipe(RiderLocationBatchSchema)) body: z.infer<typeof RiderLocationBatchSchema>,
  ): Promise<LocationBatchResult> {
    if (!isRider(me.roles)) throw new AppError('forbidden', 'Only riders can report locations.');
    const { limit, windowSeconds } = HTTP_BATCH_LIMIT;
    if (!(await this.limiter.hit(`rl:loc:http:${me.userId}`, limit, windowSeconds))) {
      throw new AppError('rate_limited', 'Too many location batches. Retry shortly.');
    }
    return this.tracking.ingest(me.userId, body.points);
  }
}
