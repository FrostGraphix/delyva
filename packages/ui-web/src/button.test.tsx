import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, buttonClassName } from './button.js';

describe('Button (web)', () => {
  it('renders a type=button ink button by default', () => {
    const html = renderToStaticMarkup(<Button>Continue</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('bg-button-ink');
    expect(html).toContain('Continue');
  });

  it('disables and marks busy while loading', () => {
    const html = renderToStaticMarkup(
      <Button variant="brand" size="lg" loading>
        Pay
      </Button>,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('h-14');
  });

  it('maps every variant to token classes', () => {
    expect(buttonClassName('danger', 'sm')).toContain('bg-danger');
    expect(buttonClassName('soft')).toContain('bg-lime-100');
    expect(buttonClassName('ghost')).toContain('bg-transparent');
  });
});
