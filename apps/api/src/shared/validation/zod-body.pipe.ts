import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/** Validates a request body with a shared contracts Zod schema (unknown fields rejected by strict schemas). */
export class ZodBodyPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  /** @param schema contracts schema */
  constructor(private readonly schema: T) {}

  /** @inheritdoc */
  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const errors = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError('validation_failed', 'The request body is invalid.', errors);
  }
}
