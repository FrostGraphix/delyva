import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/** Validates the query string with a shared contracts Zod schema (strict: unknown params rejected). */
export class ZodQueryPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  /** @param schema contracts schema */
  constructor(private readonly schema: T) {}

  /** @inheritdoc */
  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const errors = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError('validation_failed', 'The query parameters are invalid.', errors);
  }
}
