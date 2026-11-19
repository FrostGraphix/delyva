import { describe, expect, it } from 'vitest';
import { buttonStyleSpec } from './button-styles.js';

describe('buttonStyleSpec', () => {
  it('uses ink with white text in light mode and inverts in dark mode', () => {
    expect(buttonStyleSpec('ink', 'md', 'light')).toMatchObject({
      backgroundColor: '#0B0F0A',
      color: '#FFFFFF',
      height: 48,
    });
    expect(buttonStyleSpec('ink', 'md', 'dark')).toMatchObject({
      backgroundColor: '#F1F2F0',
      color: '#0B0F0A',
    });
  });

  it('puts ink text on lime, never white', () => {
    expect(buttonStyleSpec('brand', 'lg', 'light')).toMatchObject({
      backgroundColor: '#8CC63F',
      color: '#0B0F0A',
      height: 56,
    });
  });

  it('pads small buttons up to a 48dp touch target', () => {
    expect(buttonStyleSpec('ghost', 'sm', 'light').hitSlop).toBe(6);
    expect(buttonStyleSpec('soft', 'lg', 'light').hitSlop).toBe(0);
    expect(buttonStyleSpec('danger', 'md', 'light').backgroundColor).toBe('#E5484D');
  });
});
