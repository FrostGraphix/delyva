import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccentPicker } from './accent-picker.js';

const props = {
  legend: 'Accent colour',
  labels: { green: 'Green', orange: 'Orange' },
  options: ['green', 'orange'] as const,
  selectedLabel: 'Selected',
  onChange: () => undefined,
};

describe('AccentPicker', () => {
  it('renders a labelled radio group with one radio per accent', () => {
    const html = renderToStaticMarkup(<AccentPicker {...props} value="green" />);
    expect(html).toContain('<legend');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('Green');
    expect(html).toContain('Orange');
  });

  it('marks selection with text, not colour alone', () => {
    const html = renderToStaticMarkup(<AccentPicker {...props} value="orange" />);
    expect(html.match(/Selected/g)).toHaveLength(1);
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    expect(inputs.filter((i) => i.includes('checked'))).toHaveLength(1);
    expect(inputs.find((i) => i.includes('checked'))).toContain('value="orange"');
  });
});
