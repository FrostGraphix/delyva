import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './logger.js';

describe('log redaction', () => {
  it('never writes phone numbers, OTPs or tokens', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);

    logger.info({ body: { phone: '+2348031234567', code: '123456', refreshToken: 'abc' } }, 'x');

    const out = lines.join('');
    expect(out).not.toContain('+2348031234567');
    expect(out).not.toContain('123456');
    expect(out).not.toContain('"abc"');
    expect(out).toContain('[REDACTED]');
  });
});
