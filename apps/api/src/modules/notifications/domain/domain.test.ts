import { describe, expect, it } from 'vitest';
import { CONSUMED_EVENT_TYPES, orderCommand, welcomeCommand } from './event-mappings.js';
import { effectivePreferences, selectChannels } from './preferences.js';
import { messageKey, renderTemplate, TEMPLATES, TemplateRenderError } from './templates.js';
import { MESSAGES } from './messages.js';

const orderId = '7a1c3b9e-1111-4f5e-9d2a-0a6a1c1f0e11';

describe('renderTemplate', () => {
  it('renders English copy with params and falls back to the body for text', () => {
    const r = renderTemplate('order.placed', 'en', { orderRef: 'AB12' });
    expect(r).toEqual({
      title: 'Order placed',
      body: 'We have sent order AB12 to the vendor.',
      text: 'We have sent order AB12 to the vendor.',
    });
  });

  it('uses the dedicated SMS text when present', () => {
    expect(renderTemplate('order.rider_assigned', 'en', { orderRef: 'X' }).text).toBe(
      'Delyva: a rider is on the way for order X.',
    );
  });

  it('falls back to English for untranslated locales', () => {
    expect(renderTemplate('account.welcome', 'yo', {}).title).toBe('Welcome to Delyva');
  });

  it('rejects a missing required param', () => {
    expect(() => renderTemplate('order.delivered', 'en', {})).toThrow(TemplateRenderError);
  });

  it('has English title and body for every template (i18n keys complete)', () => {
    for (const id of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
      expect(MESSAGES.en[messageKey(id, 'title')]).toBeTruthy();
      expect(MESSAGES.en[messageKey(id, 'body')]).toBeTruthy();
    }
  });
});

describe('preferences', () => {
  it('defaults: push+in_app on for orders, promotions only in-app, SMS opt-in', () => {
    const prefs = effectivePreferences([]);
    expect(prefs).toHaveLength(12);
    const on = (c: string) =>
      prefs.filter((p) => p.category === c && p.enabled).map((p) => p.channel);
    expect(on('order_updates')).toEqual(['push', 'in_app']);
    expect(on('promotions')).toEqual(['in_app']);
  });

  it('filters template channels by stored overrides', () => {
    const t = TEMPLATES['order.rider_assigned'];
    expect(selectChannels(t, [])).toEqual(['push', 'in_app']);
    expect(
      selectChannels(t, [
        { category: 'order_updates', channel: 'push', enabled: false },
        { category: 'order_updates', channel: 'sms', enabled: true },
      ]),
    ).toEqual(['in_app', 'sms']);
  });

  it('ignores opt-outs for mandatory templates', () => {
    const t = { ...TEMPLATES['account.welcome'], mandatory: true };
    expect(selectChannels(t, [{ category: 'account', channel: 'push', enabled: false }])).toEqual([
      'push',
      'in_app',
    ]);
  });
});

describe('event mappings', () => {
  it('maps registration to a welcome and order events to customer notifications', () => {
    expect(welcomeCommand('e1', 'u1')).toMatchObject({ template: 'account.welcome', userId: 'u1' });
    expect(
      orderCommand('e2', 'ordering.order.delivered', { orderId, customerId: 'c1' }),
    ).toMatchObject({
      template: 'order.delivered',
      userId: 'c1',
      params: { orderRef: '7A1C3B9E' },
      data: { orderId },
    });
    expect(
      orderCommand('e3', 'ordering.order.preparing', { orderId, customerId: 'c1' }),
    ).toBeNull();
    expect(CONSUMED_EVENT_TYPES).toContain('identity.user.registered');
  });
});
