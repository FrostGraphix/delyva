import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Alert } from './alert.js';
import { Badge, badgeToneClassName } from './badge.js';
import { Card } from './card.js';
import { EmptyState } from './empty-state.js';
import { SelectField, TextAreaField, TextField } from './field.js';
import { Skeleton } from './skeleton.js';
import { StatCard } from './stat-card.js';
import { ToastViewport } from './toast.js';

describe('ui-web primitives', () => {
  it('StatCard shows the unavailable label instead of a number when value is null', () => {
    const html = renderToStaticMarkup(
      <StatCard label="GMV" value={null} unavailableLabel="Needs reporting endpoint" />,
    );
    expect(html).toContain('Needs reporting endpoint');
    expect(html).not.toContain('font-extrabold');
  });

  it('TextField wires label, hint and error for screen readers', () => {
    const html = renderToStaticMarkup(
      <TextField id="phone" label="Phone" hint="+234" error="Required" />,
    );
    expect(html).toContain('for="phone"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="phone-hint phone-error"');
    expect(html).toContain('role="alert"');
  });

  it('TextAreaField omits aria-describedby when there is no hint or error', () => {
    const html = renderToStaticMarkup(<TextAreaField id="reason" label="Reason" />);
    expect(html).not.toContain('aria-describedby');
  });

  it('SelectField renders every option', () => {
    const html = renderToStaticMarkup(
      <SelectField
        id="s"
        label="Status"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(html.match(/<option/g)).toHaveLength(2);
  });

  it('Alert uses role=alert only for danger', () => {
    expect(renderToStaticMarkup(<Alert tone="danger" title="Failed" />)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Alert title="Offline" />)).toContain('role="status"');
  });

  it('Skeleton exposes a status label and the requested bar count', () => {
    const html = renderToStaticMarkup(<Skeleton label="Loading orders" lines={2} />);
    expect(html).toContain('aria-label="Loading orders"');
    expect(html.match(/animate-pulse/g)).toHaveLength(2);
  });

  it('Badge, Card and EmptyState render token classes only', () => {
    expect(badgeToneClassName('danger')).toContain('text-danger');
    expect(renderToStaticMarkup(<Badge tone="success">Online</Badge>)).toContain('Online');
    expect(renderToStaticMarkup(<Card title="Riders">x</Card>)).toContain('<h2');
    expect(renderToStaticMarkup(<EmptyState title="No orders" />)).toContain('No orders');
  });

  it('ToastViewport labels the dismiss button', () => {
    const html = renderToStaticMarkup(
      <ToastViewport
        toasts={[{ id: '1', tone: 'success', message: 'Saved' }]}
        onDismiss={() => undefined}
        dismissLabel="Dismiss"
      />,
    );
    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toContain('Saved');
  });
});
