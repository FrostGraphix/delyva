import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseIcon, ICON_PATHS } from './web.js';

describe('web icons', () => {
  it('renders a 24-grid stroke icon in currentColor, hidden from AT by default', () => {
    const html = renderToStaticMarkup(<HouseIcon />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('exposes an accessible label and token size when given', () => {
    const html = renderToStaticMarkup(<HouseIcon size={32} accessibilityLabel="Home" />);
    expect(html).toContain('aria-label="Home"');
    expect(html).toContain('width="32"');
  });

  it('ships the core set', () => {
    expect(Object.keys(ICON_PATHS)).toEqual([
      'check-circle',
      'house',
      'map-pin',
      'shopping-bag',
      'x',
    ]);
  });
});
