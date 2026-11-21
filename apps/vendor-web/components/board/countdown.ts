import { useEffect, useState } from 'react';

/** Formats remaining seconds as `m:ss` (never negative). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds left until `deadline`, ticking every second; null when there is no deadline. */
export function useSecondsLeft(deadline: Date | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(id);
    };
  }, [deadline]);
  return deadline ? Math.max(0, (deadline.getTime() - now) / 1_000) : null;
}
