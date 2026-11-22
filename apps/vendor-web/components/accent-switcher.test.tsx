import { AccentSwitcher } from '@delyva/ui-web';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const labels = { green: 'Green', orange: 'Orange' };

describe('AccentSwitcher', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-accent', 'green');
    document.cookie = 'dl_accent=; Max-Age=0; Path=/';
  });
  afterEach(cleanup);

  it('reflects the active accent from <html> on mount', async () => {
    document.documentElement.setAttribute('data-accent', 'orange');
    render(<AccentSwitcher legend="Accent colour" labels={labels} selectedLabel="Selected" />);
    const orange = await screen.findByRole<HTMLInputElement>('radio', { name: /Orange/ });
    await waitFor(() => {
      expect(orange.checked).toBe(true);
    });
  });

  it('switching updates data-accent and the dl_accent cookie immediately', async () => {
    render(<AccentSwitcher legend="Accent colour" labels={labels} selectedLabel="Selected" />);
    await userEvent.click(screen.getByRole('radio', { name: /Orange/ }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('orange');
    expect(document.cookie).toContain('dl_accent=orange');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Orange/ }).checked).toBe(true);
    expect(screen.getByText('Selected')).toBeTruthy();
  });
});
