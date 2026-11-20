import type { NotificationPage } from '@delyva/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import type { Clock, InboxRepository } from './ports.js';

/** Encodes an opaque pagination cursor from the last item. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

/** Decodes a cursor; invalid cursors are a 400. */
export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(createdAt.getTime())) {
    throw new AppError('validation_failed', 'The cursor is invalid.', [
      { path: 'cursor', message: 'Invalid cursor' },
    ]);
  }
  return { createdAt, id };
}

/** Query: newest-first page of the caller's inbox. */
export class ListInbox {
  /** @param inbox inbox repository */
  constructor(private readonly inbox: InboxRepository) {}

  /** Executes the query for the authenticated user only. */
  async execute(
    userId: string,
    query: { limit: number; cursor?: string | undefined; unreadOnly?: boolean | undefined },
  ): Promise<NotificationPage> {
    const before = query.cursor ? decodeCursor(query.cursor) : null;
    const [items, unreadCount] = await Promise.all([
      this.inbox.list(userId, {
        limit: query.limit + 1,
        before,
        unreadOnly: query.unreadOnly ?? false,
      }),
      this.inbox.unreadCount(userId),
    ]);
    const page = items.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      items.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null;
    return { items: page, nextCursor, unreadCount };
  }
}

/** Command: mark one of the caller's notifications read (re-marking is a no-op success). */
export class MarkNotificationRead {
  /** @param inbox inbox repository @param clock clock */
  constructor(
    private readonly inbox: InboxRepository,
    private readonly clock: Clock,
  ) {}

  /** @throws AppError not_found when the item does not exist or belongs to someone else (no IDOR oracle). */
  async execute(userId: string, id: string): Promise<void> {
    if (!(await this.inbox.markRead(userId, id, this.clock.now()))) {
      throw new AppError('not_found', 'Notification not found.');
    }
  }
}
