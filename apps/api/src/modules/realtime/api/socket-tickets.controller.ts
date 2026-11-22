import { Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { RealtimeTicket } from '@delyva/contracts';
import { type AuthPrincipal, AuthGuard, Principal } from '../../../shared/auth/auth.guard.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { LocationRateLimiter } from '../application/ports.js';
import { SOCKET_TICKET_LIMIT, SocketTickets } from '../application/socket-tickets.js';
import { RedisLocationRateLimiter } from '../infrastructure/redis-location.store.js';

/**
 * POST /v1/realtime/tickets — mints a 60 s single-use Socket.IO handshake ticket (ADR 0820).
 * Minting only creates a short-lived key, so no Idempotency-Key is required; it is rate limited.
 */
@Controller('v1/realtime/tickets')
@UseGuards(AuthGuard)
export class SocketTicketsController {
  /** Injected collaborators. */
  constructor(
    @Inject(SocketTickets) private readonly tickets: SocketTickets,
    @Inject(RedisLocationRateLimiter) private readonly limiter: LocationRateLimiter,
  ) {}

  /** Issues a ticket for the authenticated principal. */
  @Post()
  @HttpCode(201)
  async create(@Principal() me: AuthPrincipal): Promise<RealtimeTicket> {
    const { limit, windowSeconds } = SOCKET_TICKET_LIMIT;
    if (!(await this.limiter.hit(`rl:rt:ticket:${me.userId}`, limit, windowSeconds))) {
      throw new AppError('rate_limited', 'Too many realtime tickets. Retry shortly.');
    }
    return this.tickets.issue(me);
  }
}
