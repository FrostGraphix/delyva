import { describe, expect, it } from 'vitest';
import { sanitizeCode } from './sanitize-code.js';

describe('sanitizeCode', () => {
  it('keeps digits only', () => {
    expect(sanitizeCode('12-3 4a', 6)).toBe('1234');
  });

  it('caps the code at the requested length', () => {
    expect(sanitizeCode('12345678', 6)).toBe('123456');
  });

  it('returns an empty string for a non-positive length', () => {
    expect(sanitizeCode('123', 0)).toBe('');
  });
});
