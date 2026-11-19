import { describe, expect, it } from 'vitest';
import { TermiiSmsSender } from './sms.senders.js';

describe('TermiiSmsSender', () => {
  const config = { apiKey: 'test-key', senderId: 'Delyva', baseUrl: 'https://termii.test' };

  it('posts the OTP message to Termii without the leading plus', async () => {
    let captured: { url: string; body: Record<string, string> } | undefined;
    const fakeFetch: typeof fetch = (input, init) => {
      captured = {
        url: input as string,
        body: JSON.parse(init?.body as string) as Record<string, string>,
      };
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    await new TermiiSmsSender(config, fakeFetch).sendOtp('+2348031234567', '123456');
    expect(captured?.url).toBe('https://termii.test/api/sms/send');
    expect(captured?.body.to).toBe('2348031234567');
    expect(captured?.body.sms).toContain('123456');
  });

  it('throws on a non-2xx response', async () => {
    const fakeFetch: typeof fetch = () => Promise.resolve(new Response('no', { status: 500 }));
    await expect(
      new TermiiSmsSender(config, fakeFetch).sendOtp('+2348031234567', '1'),
    ).rejects.toThrow(/500/);
  });
});
