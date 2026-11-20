import 'reflect-metadata';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { IdentityModule } from './modules/identity/identity.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import type { Env } from './shared/config/env.js';
import { createRootLogger, PinoNestLogger } from './shared/logging/logger.js';
import { SharedModule } from './shared/shared.module.js';
import { resolveTraceId, runWithContext } from './shared/tracing/request-context.js';

function requestContext(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const traceId = resolveTraceId(req.header('traceparent'), req.header('x-request-id'));
    res.setHeader('x-request-id', traceId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      runWithContext({ traceId }, () => {
        logger.info(
          { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) },
          'request',
        );
      });
    });
    runWithContext({ traceId }, next);
  };
}

/** Builds the Nest application (used by main and integration tests). */
export async function createApp(env: Env): Promise<{ app: INestApplication; logger: Logger }> {
  const logger = createRootLogger(env.LOG_LEVEL);

  @Module({
    imports: [SharedModule.forRoot(env, logger), IdentityModule, PricingModule, PaymentsModule],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, {
    logger: new PinoNestLogger(logger),
    bodyParser: true,
    // Keeps req.rawBody (Buffer) next to the parsed JSON for webhook HMAC checks; other routes unaffected.
    rawBody: true,
  });
  app.use(requestContext(logger));
  app.enableShutdownHooks();
  // DEBT(platform): helmet/CORS/trust-proxy not configured — no public edge yet — configure with Cloudflare/ALB in staging.
  return { app, logger };
}
