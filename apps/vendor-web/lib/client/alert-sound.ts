'use client';

/** Chime pattern: frequency (Hz) and duration (s) per note. Loud, two-tone, unmistakable. */
const NOTES: readonly (readonly [number, number])[] = [
  [880, 0.18],
  [1320, 0.18],
  [880, 0.18],
  [1320, 0.32],
];

let ctx: AudioContext | null = null;

/**
 * Unlocks audio. Browsers block sound until a user gesture, so the board shows an "Enable order
 * sound" button that calls this once per session.
 */
export async function unlockSound(): Promise<boolean> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/** True once audio has been unlocked. */
export function soundReady(): boolean {
  return ctx?.state === 'running';
}

/** Plays the new-order chime with the Web Audio API (no audio asset to download). */
export function playChime(): void {
  if (ctx?.state !== 'running') return;
  let at = ctx.currentTime;
  for (const [freq, dur] of NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.25, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur);
    at += dur + 0.04;
  }
}
