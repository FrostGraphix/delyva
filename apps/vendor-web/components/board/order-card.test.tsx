import type { Order, OrderSummary } from '@delyva/contracts';
import { ToastProvider } from '@delyva/ui-web';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSecondsLeft } from './countdown';
import { OrderCard } from './order-card';

const ID = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
const V = '20000000-0000-4000-8000-000000000001';
const money = (n: number) => ({ amountMinor: n, currency: 'NGN' as const });

const summary = (status: OrderSummary['status']): OrderSummary => ({
  id: ID,
  ref: '48213',
  status,
  vendorId: V,
  vendorName: 'Mama Put',
  branchId: V,
  customerId: V,
  total: money(450_000),
  itemCount: 3,
  createdAt: new Date().toISOString(),
});

const order = (status: Order['status']): Order => ({
  id: ID,
  ref: '48213',
  status,
  vendorId: V,
  vendorName: 'Mama Put',
  branchId: V,
  items: [
    {
      itemId: V,
      name: 'Jollof',
      quantity: 2,
      options: [],
      unitPrice: money(1),
      lineTotal: money(2),
    },
  ],
  totals: {
    itemsSubtotal: money(1),
    deliveryFee: money(0),
    surgeFee: money(0),
    smallOrderFee: money(0),
    serviceFee: money(0),
    discount: money(0),
    vat: money(0),
    total: money(1),
  },
  payment: { method: 'wallet', intentId: null, intentStatus: null, authorizationUrl: null },
  promoCode: null,
  prepMinutes: status === 'PLACED' ? null : 20,
  readyAt: null,
  etaMinutes: 30,
  rider: null,
  deliveryOtp: null,
  pickupCode: '3816',
  timeline: [{ status: 'PLACED', at: new Date().toISOString(), actorType: 'system', reason: null }],
  createdAt: new Date().toISOString(),
});

const ordering = {
  getOrder: vi.fn(),
  acceptVendorOrder: vi.fn(),
  rejectVendorOrder: vi.fn(),
  markVendorOrderPreparing: vi.fn(),
  markVendorOrderReady: vi.fn(),
};
vi.mock('../../lib/client/api', () => ({ browserClient: () => ({ ordering }) }));

function wrap(ui: ReactNode): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('OrderCard', () => {
  it('accepts a new order with the chosen prep time and an idempotency key', async () => {
    // Arrange
    vi.stubEnv('NEXT_PUBLIC_AUTO_REJECT_SECONDS', '300');
    ordering.getOrder.mockResolvedValue(order('PLACED'));
    ordering.acceptVendorOrder.mockResolvedValue(order('VENDOR_ACCEPTED'));
    wrap(<OrderCard summary={summary('PLACED')} vendorId={V} />);
    // Act
    expect(await screen.findByText(/2× Jollof/)).toBeTruthy();
    expect(screen.getByText(/Auto-rejects in [45]:/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await userEvent.click(screen.getByRole('button', { name: '20 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept · 20 min' }));
    // Assert
    await waitFor(() => {
      expect(ordering.acceptVendorOrder).toHaveBeenCalledWith(
        ID,
        { prepMinutes: 20 },
        expect.stringMatching(/-accept$/),
      );
    });
    expect(await screen.findByText('Order 48213 accepted')).toBeTruthy();
    expect(screen.queryByText('3816')).toBeNull();
  });

  it('moves an accepted order to preparing and a preparing one to ready, showing the pickup code', async () => {
    ordering.getOrder.mockResolvedValue(order('PREPARING'));
    ordering.markVendorOrderReady.mockResolvedValue(order('READY_FOR_PICKUP'));
    wrap(<OrderCard summary={summary('PREPARING')} vendorId={V} />);
    expect(await screen.findByText('3816')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    await waitFor(() => {
      expect(ordering.markVendorOrderReady).toHaveBeenCalled();
    });
  });

  it('starts preparing from VENDOR_ACCEPTED', async () => {
    ordering.getOrder.mockResolvedValue(order('VENDOR_ACCEPTED'));
    ordering.markVendorOrderPreparing.mockResolvedValue(order('PREPARING'));
    wrap(<OrderCard summary={summary('VENDOR_ACCEPTED')} vendorId={V} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start preparing' }));
    await waitFor(() => {
      expect(ordering.markVendorOrderPreparing).toHaveBeenCalled();
    });
  });

  it('rejects with a reason and surfaces API errors as a toast', async () => {
    ordering.getOrder.mockResolvedValue(order('PLACED'));
    ordering.rejectVendorOrder.mockRejectedValue(new Error('boom'));
    wrap(<OrderCard summary={summary('PLACED')} vendorId={V} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject order' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(ordering.rejectVendorOrder).toHaveBeenCalledWith(
      ID,
      { reason: 'Items out of stock' },
      expect.any(String),
    );
  });

  it('shows a waiting note once the order is ready', async () => {
    ordering.getOrder.mockResolvedValue(order('READY_FOR_PICKUP'));
    wrap(<OrderCard summary={summary('READY_FOR_PICKUP')} vendorId={V} />);
    expect(await screen.findByText('Waiting for rider')).toBeTruthy();
  });
});

describe('useSecondsLeft', () => {
  it('ticks down to a deadline and returns null without one', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ d }: { d: Date | null }) => useSecondsLeft(d), {
      initialProps: { d: new Date(Date.now() + 10_000) as Date | null },
    });
    expect(Math.round(result.current ?? -1)).toBe(10);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(Math.round(result.current ?? -1)).toBe(7);
    rerender({ d: null });
    expect(result.current).toBeNull();
    vi.useRealTimers();
  });
});
