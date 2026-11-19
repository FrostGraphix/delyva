import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import {
  type ErrorCode,
  ErrorCodeSchema,
  PROBLEM_CONTENT_TYPE,
  type Problem,
} from '@delyva/contracts';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { LOGGER } from '../logging/logger.js';
import { currentTraceId } from '../tracing/request-context.js';
import { AppError, STATUS_BY_CODE } from './app-error.js';

const TITLES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function codeForStatus(status: number): ErrorCode {
  const match = (Object.entries(STATUS_BY_CODE) as [ErrorCode, number][]).find(
    ([, s]) => s === status,
  );
  return match?.[0] ?? (status >= 500 ? 'internal_error' : 'validation_failed');
}

/** True for AppError and domain errors: any Error carrying a known stable code. */
function isCodedError(e: unknown): e is Error & { code: ErrorCode } {
  return e instanceof Error && ErrorCodeSchema.safeParse((e as { code?: unknown }).code).success;
}

/** Converts any thrown error into an RFC 9457 problem+json body; never leaks stack traces. */
export function toProblem(error: unknown, instance: string): Problem {
  const base = { type: 'about:blank', instance, traceId: currentTraceId() };
  if (isCodedError(error)) {
    const status = STATUS_BY_CODE[error.code];
    const errors = error instanceof AppError ? error.fieldErrors : undefined;
    return {
      ...base,
      status,
      title: TITLES[status] ?? 'Error',
      code: error.code,
      detail: error.message,
      ...(errors ? { errors: [...errors] } : {}),
    };
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return {
      ...base,
      status,
      title: TITLES[status] ?? 'Error',
      code: codeForStatus(status),
      detail: error.message,
    };
  }
  return {
    ...base,
    status: 500,
    title: 'Internal Server Error',
    code: 'internal_error',
    detail: 'Something went wrong. Please try again.',
  };
}

/** Global exception filter producing `application/problem+json`. */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  /** @param logger root logger */
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  /** @inheritdoc */
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const problem = toProblem(exception, req.path);
    if (problem.status >= 500) {
      this.logger.error({ err: exception, path: req.path }, 'unhandled error');
    }
    res.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
  }
}
