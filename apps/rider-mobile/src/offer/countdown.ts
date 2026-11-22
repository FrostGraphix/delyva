import { useEffect, useState } from 'react';

/** Longest offer window the UI will ever show (API default DISPATCH_OFFER_TIMEOUT_MS = 20 s). */
export const MAX_OFFER_SECONDS = 20;

/**
 * Whole seconds left before `deadlineMs`, never negative and capped at
 * {@link MAX_OFFER_SECONDS} so a fast device clock cannot show more time than the server gives.
 */
export function secondsLeft(deadlineMs: number, nowMs: number): number {
  const s = Math.ceil((deadlineMs - nowMs) / 1000);
  return Math.min(MAX_OFFER_SECONDS, Math.max(0, s));
}

/** Ticks every 250 ms until the deadline; returns the seconds left (0 = expired). */
export function useCountdown(deadlineIso: string, now: () => number = Date.now): number {
  const deadline = Date.parse(deadlineIso);
  const [left, setLeft] = useState(() => secondsLeft(deadline, now()));
  useEffect(() => {
    setLeft(secondsLeft(deadline, now()));
    const timer = setInterval(() => {
      const next = secondsLeft(deadline, now());
      setLeft(next);
      if (next === 0) clearInterval(timer);
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [deadline, now]);
  return left;
}
