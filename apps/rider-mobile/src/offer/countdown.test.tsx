import { act, renderHook } from '@testing-library/react-native';
import { MAX_OFFER_SECONDS, secondsLeft, useCountdown } from './countdown';

describe('secondsLeft', () => {
  it('rounds up to whole seconds', () => {
    expect(secondsLeft(10_500, 0)).toBe(11);
  });

  it('never goes below zero after the deadline', () => {
    expect(secondsLeft(1_000, 5_000)).toBe(0);
  });

  it('caps at the server offer window when the device clock runs slow', () => {
    expect(secondsLeft(120_000, 0)).toBe(MAX_OFFER_SECONDS);
  });
});

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts down from 20 s to 0 and stops', async () => {
    // Arrange
    let now = 0;
    const clock = (): number => now;
    const deadline = new Date(20_000).toISOString();
    const { result } = await renderHook(() => useCountdown(deadline, clock));
    expect(result.current).toBe(20);

    // Act
    await act(async () => {
      now = 5_000;
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    const afterFive = result.current;
    await act(async () => {
      now = 21_000;
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    // Assert
    expect(afterFive).toBe(15);
    expect(result.current).toBe(0);
  });
});
