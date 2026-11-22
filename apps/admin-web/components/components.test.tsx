import { ApiError } from '@delyva/sdk';
import type { UseQueryResult } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderStatusBadge, orderStatusTone } from './order-status-badge';
import { QueryView } from './query-view';
import { ReasonDialog } from './reason-dialog';
import { RidersMap, project } from './riders-map';

function q<T>(over: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...over,
  } as unknown as UseQueryResult<T>;
}

const problem = (status: number, code: 'forbidden' | 'internal_error') =>
  new ApiError({ type: 'x', title: 'Boom', status, code, detail: 'The API said no.' });

describe('QueryView', () => {
  const view = (query: UseQueryResult<number[]>) =>
    render(
      <QueryView query={query} what="orders" isEmpty={(d) => d.length === 0} empty={<p>nothing</p>}>
        {(d) => <p>{`rows:${String(d.length)}`}</p>}
      </QueryView>,
    );

  it('shows a labelled skeleton while loading', () => {
    view(q({ isPending: true }));
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeTruthy();
  });

  it('shows the error with a working retry', () => {
    const refetch = vi.fn();
    view(q({ isError: true, error: problem(500, 'internal_error'), refetch }));
    expect(screen.getByRole('alert').textContent).toContain('The API said no.');
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows no-access for 403 forbidden', () => {
    view(q({ isError: true, error: problem(403, 'forbidden') }));
    expect(screen.getByText('No access')).toBeTruthy();
  });

  it('renders the empty state', () => {
    view(q({ data: [] }));
    expect(screen.getByText('nothing')).toBeTruthy();
  });

  it('renders the success state', () => {
    view(q({ data: [1, 2] }));
    expect(screen.getByText('rows:2')).toBeTruthy();
  });
});

describe('ReasonDialog', () => {
  it('requires a 5+ character reason before confirming', () => {
    const onConfirm = vi.fn();
    render(
      <ReasonDialog
        open
        title="Cancel order"
        confirmLabel="Cancel order"
        busy={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getAllByRole('button', { name: 'Cancel order', hidden: true }).at(-1);
    if (!confirm) throw new Error('confirm button missing');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Write at least 5 characters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason (for the audit log)'), {
      target: { value: '  Customer asked twice  ' },
    });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Customer asked twice');
  });
});

describe('status badge and map', () => {
  it('maps statuses to tones with a text label', () => {
    expect(orderStatusTone('DELIVERED')).toBe('success');
    expect(orderStatusTone('CANCELLED_BY_OPS')).toBe('danger');
    expect(orderStatusTone('PENDING_PAYMENT')).toBe('warning');
    expect(orderStatusTone('REFUNDED')).toBe('neutral');
    expect(orderStatusTone('PREPARING')).toBe('info');
    render(<OrderStatusBadge status="PLACED" />);
    expect(screen.getByText('Placed')).toBeTruthy();
  });

  it('projects Lagos coordinates into the plot and clamps outliers', () => {
    expect(project(6.7, 3.25)).toEqual({ x: 0, y: 0 });
    expect(project(0, 99)).toEqual({ x: 400, y: 260 });
    render(
      <RidersMap
        riders={[
          {
            riderId: '11111111-1111-4111-8111-111111111111',
            status: 'online',
            vehiclePlate: null,
            batteryPct: 80,
            position: { lat: 6.43, lng: 3.42, ts: 1 },
            activeOrderId: null,
          },
          {
            riderId: '22222222-2222-4222-8222-222222222222',
            status: 'offline',
            vehiclePlate: null,
            batteryPct: null,
            position: null,
            activeOrderId: null,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: /online rider positions/ }).querySelectorAll('circle'),
    ).toHaveLength(1);
  });
});
