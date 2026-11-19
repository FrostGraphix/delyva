import type { LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';
import { currentTraceId } from '../tracing/request-context.js';

/** Field paths that must never reach logs (PII, secrets, OTPs, tokens). */
export const REDACT_PATHS = [
  'phone',
  '*.phone',
  'code',
  '*.code',
  'otp',
  '*.otp',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'password',
  '*.password',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
];

/** Creates the structured JSON root logger with redaction and trace-id mixin. */
export function createRootLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'delyva-api' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin: () => {
      const traceId = currentTraceId();
      return traceId ? { traceId } : {};
    },
  });
}

/** Adapts pino to Nest's LoggerService so framework logs are structured too. */
export class PinoNestLogger implements LoggerService {
  /** @param logger root pino logger */
  constructor(private readonly logger: Logger) {}

  /** @inheritdoc */
  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }
  /** @inheritdoc */
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, String(message));
  }
  /** @inheritdoc */
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }
  /** @inheritdoc */
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
  /** @inheritdoc */
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }
}

/** DI token for the root pino logger. */
export const LOGGER = Symbol('LOGGER');
