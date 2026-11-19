import { describe, expect, it } from 'vitest';
import { processNotification } from './notification.job.js';

describe('processNotification', () => {
  it('delivers a valid job through the channel', async () => {
    const sent: string[] = [];
    const channel = {
      send: (userId: string, template: string) => {
        sent.push(`${userId}:${template}`);
        return Promise.resolve();
      },
    };
    const userId = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
    await expect(processNotification({ userId, template: 'welcome' }, channel)).resolves.toEqual({
      delivered: true,
      template: 'welcome',
    });
    expect(sent).toEqual([`${userId}:welcome`]);
  });

  it('rejects payloads with unknown fields so the job is retried or dead-lettered', async () => {
    const channel = { send: () => Promise.resolve() };
    await expect(
      processNotification({ userId: 'x', template: 'welcome', phone: '+234' }, channel),
    ).rejects.toThrow();
  });
});
