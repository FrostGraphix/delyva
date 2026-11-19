import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { from, type Observable, of, switchMap, catchError, throwError } from 'rxjs';
import { AppError } from '../errors/app-error.js';
import { REDIS } from '../redis/redis.js';

const IDEMPOTENT = 'delyva:idempotent';
/** Idempotency records are kept for 24 hours. */
export const IDEMPOTENCY_TTL_SECONDS = 86_400;
const KEY_PATTERN = /^[\w-]{8,128}$/;

/** Marks a write handler as requiring an `Idempotency-Key` header. */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT, true);

interface StoredRecord {
  readonly state: 'pending' | 'done';
  readonly fingerprint: string;
  readonly status?: number;
  readonly body?: unknown;
}

function fingerprint(req: Request): string {
  return createHash('sha256')
    .update(`${req.method}:${req.path}:${JSON.stringify(req.body ?? null)}`)
    .digest('hex');
}

/**
 * Redis-backed Idempotency-Key handling: first request runs and its response is stored 24h;
 * replays with the same body get the stored response; a different body or an in-flight
 * duplicate gets 409. Failed requests release the key so the client may retry.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  /** @param reflector Nest reflector @param redis shared redis */
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** @inheritdoc */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, context.getHandler())) return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    if (!key || !KEY_PATTERN.test(key)) {
      return throwError(
        () =>
          new AppError('idempotency_key_required', 'A valid Idempotency-Key header is required.'),
      );
    }
    const redisKey = `idem:${req.method}:${req.path}:${key}`;
    const fp = fingerprint(req);
    return from(this.claim(redisKey, fp)).pipe(
      switchMap((existing) =>
        existing ? of(this.replay(existing, fp, res)) : this.run(next, redisKey, fp, res),
      ),
    );
  }

  private async claim(redisKey: string, fp: string): Promise<StoredRecord | null> {
    const pending: StoredRecord = { state: 'pending', fingerprint: fp };
    const ok = await this.redis.set(
      redisKey,
      JSON.stringify(pending),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );
    if (ok === 'OK') return null;
    const raw = await this.redis.get(redisKey);
    return raw ? (JSON.parse(raw) as StoredRecord) : null;
  }

  private replay(existing: StoredRecord, fp: string, res: Response): unknown {
    if (existing.fingerprint !== fp) {
      throw new AppError(
        'idempotency_key_conflict',
        'This Idempotency-Key was used with a different request.',
      );
    }
    if (existing.state === 'pending') {
      throw new AppError(
        'idempotency_key_conflict',
        'A request with this Idempotency-Key is still in progress.',
      );
    }
    res.status(existing.status ?? 200).setHeader('Idempotent-Replayed', 'true');
    return existing.body;
  }

  private run(next: CallHandler, redisKey: string, fp: string, res: Response): Observable<unknown> {
    return next.handle().pipe(
      switchMap(async (body: unknown) => {
        const done: StoredRecord = { state: 'done', fingerprint: fp, status: res.statusCode, body };
        await this.redis.set(redisKey, JSON.stringify(done), 'EX', IDEMPOTENCY_TTL_SECONDS);
        return body;
      }),
      catchError((err: unknown) =>
        from(this.redis.del(redisKey)).pipe(switchMap(() => throwError(() => err))),
      ),
    );
  }
}
