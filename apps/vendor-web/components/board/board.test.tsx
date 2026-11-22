import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatCountdown } from './countdown';
import { NewOrderAlert } from './new-order-alert';
import { AcceptDialog, RejectDialog } from './order-dialogs';

vi.mock('../../lib/client/alert-sound', () => ({
  playChime: vi.fn(),
  soundReady: () => false,
  unlockSound: () => Promise.resolve(true),
}));

describe('NewOrderAlert', () => {
  it('shows a loud alert while orders wait, and nothing but the sound toggle otherwise', () => {
    const { rerender } = render(<NewOrderAlert waitingIds={[]} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /enable order sound/i })).toBeTruthy();
    rerender(<NewOrderAlert waitingIds={['a', 'b']} />);
    expect(screen.getByRole('alert').textContent).toContain('2 new orders waiting');
  });

  it('plays the chime when a new order appears', async () => {
    const sound = await import('../../lib/client/alert-sound');
    render(<NewOrderAlert waitingIds={['x1']} />);
    expect(sound.playChime).toHaveBeenCalled();
  });
});

describe('AcceptDialog', () => {
  it('confirms with the chosen prep time', async () => {
    // Arrange
    const onConfirm = vi.fn();
    render(
      <AcceptDialog orderRef="48213" open busy={false} onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    // Act
    await userEvent.click(screen.getByRole('button', { name: '30 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept · 30 min' }));
    // Assert
    expect(onConfirm).toHaveBeenCalledWith(30);
    expect(screen.getByRole('button', { name: '30 min' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('RejectDialog', () => {
  it('requires details when the reason is "Other"', async () => {
    const onConfirm = vi.fn();
    render(<RejectDialog orderRef="1" open busy={false} onClose={vi.fn()} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Other' }));
    const reject = screen.getByRole('button', { name: 'Reject order' });
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/details for the customer/i), 'Gas finished');
    await userEvent.click(reject);
    expect(onConfirm).toHaveBeenCalledWith('Other: Gas finished');
  });

  it('sends the preset reason by default', async () => {
    const onConfirm = vi.fn();
    render(<RejectDialog orderRef="1" open busy={false} onClose={vi.fn()} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reject order' }));
    expect(onConfirm).toHaveBeenCalledWith('Items out of stock');
  });
});

describe('formatCountdown', () => {
  it('formats m:ss and clamps at zero', () => {
    expect(formatCountdown(161)).toBe('2:41');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
