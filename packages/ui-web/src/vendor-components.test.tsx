import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, EmptyState, ErrorState, OfflineBanner, SkeletonList } from './feedback.js';
import { Switch, TextField } from './form-controls.js';
import { Dialog, ToastProvider } from './overlays.js';

describe('feedback components', () => {
  it('announces skeleton loading with a label', () => {
    const html = renderToStaticMarkup(<SkeletonList rows={2} label="Loading orders" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading orders"');
    expect(html.match(/animate-pulse/g)).toHaveLength(2);
  });

  it('renders an error panel as an alert with a retry action', () => {
    const html = renderToStaticMarkup(
      <ErrorState title="Could not load" action={{ label: 'Retry', onClick: () => undefined }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry');
  });

  it('renders an empty panel without alert semantics', () => {
    const html = renderToStaticMarkup(<EmptyState title="No orders yet" />);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('No orders yet');
  });

  it('hides the offline banner while online', () => {
    expect(renderToStaticMarkup(<OfflineBanner visible={false} message="Offline" />)).toBe('');
    expect(renderToStaticMarkup(<OfflineBanner visible message="Offline" />)).toContain('Offline');
  });

  it('maps badge tones to token classes', () => {
    expect(renderToStaticMarkup(<Badge tone="danger">Late</Badge>)).toContain('bg-danger');
  });
});

describe('form controls', () => {
  it('wires the error message to the input', () => {
    const html = renderToStaticMarkup(<TextField id="p" label="Phone" error="Invalid" />);
    expect(html).toContain('for="p"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="p-error"');
  });

  it('exposes switch state through aria-checked', () => {
    const html = renderToStaticMarkup(
      <Switch checked label="Jollof available" onChange={() => undefined} />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Jollof available"');
  });
});

describe('overlays', () => {
  it('labels the dialog by its title and hides children while closed', () => {
    const html = renderToStaticMarkup(
      <Dialog open={false} title="Accept order" onClose={() => undefined}>
        <p>body</p>
      </Dialog>,
    );
    expect(html).toContain('aria-labelledby');
    expect(html).toContain('Accept order');
    expect(html).not.toContain('body');
  });

  it('renders a polite live region for toasts', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <span>app</span>
      </ToastProvider>,
    );
    expect(html).toContain('aria-live="polite"');
  });
});
