import type { Redis } from 'ioredis';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import type { SocketTicketStore } from '../application/socket-tickets.js';

const key = (t: string): string => `rt:ticket:${t}`;

/** Redis {@link SocketTicketStore}: `SET EX` to mint, `GETDEL` to redeem (atomic single use). */
export class RedisSocketTicketStore implements SocketTicketStore {
  /** @param redis client */
  constructor(private readonly redis: Redis) {}

  /** @inheritdoc */
  async put(ticket: string, principal: AuthPrincipal, ttlSeconds: number): Promise<void> {
    await this.redis.set(key(ticket), JSON.stringify(principal), 'EX', ttlSeconds);
  }

  /** @inheritdoc */
  async take(ticket: string): Promise<AuthPrincipal | null> {
    const raw = await this.redis.getdel(key(ticket));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<AuthPrincipal>;
    if (typeof p.userId !== 'string' || !Array.isArray(p.roles)) return null;
    return p as AuthPrincipal;
  }
}
