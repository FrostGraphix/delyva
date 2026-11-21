'use client';

import { BellIcon, SpeakerIcon } from '@delyva/icons/web';
import { Button } from '@delyva/ui-web';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { playChime, soundReady, unlockSound } from '../../lib/client/alert-sound';
import { t } from '../../lib/i18n';

/** Repeat the chime this often while orders are still waiting. */
export const CHIME_REPEAT_MS = 10_000;

/**
 * The loud part of the vendor app: a flashing full-width banner, a repeating chime and a
 * flashing tab title while any order waits for acceptance. Reduced-motion users get a solid
 * banner (no flashing); the text says the same thing, so colour is never the only signal.
 */
export function NewOrderAlert({
  waitingIds,
}: {
  readonly waitingIds: readonly string[];
}): ReactNode {
  const [soundOn, setSoundOn] = useState(false);
  const seen = useRef(new Set<string>());
  const count = waitingIds.length;

  useEffect(() => {
    setSoundOn(soundReady());
  }, []);

  useEffect(() => {
    const fresh = waitingIds.some((id) => !seen.current.has(id));
    for (const id of waitingIds) seen.current.add(id);
    if (fresh) playChime();
  }, [waitingIds]);

  useEffect(() => {
    if (count === 0) return undefined;
    const chime = setInterval(playChime, CHIME_REPEAT_MS);
    const base = document.title;
    let on = false;
    const title = setInterval(() => {
      on = !on;
      document.title = on ? `(${String(count)}) ${t('alert.title')}` : base;
    }, 1_000);
    return () => {
      clearInterval(chime);
      clearInterval(title);
      document.title = base;
    };
  }, [count]);

  return (
    <div className="flex flex-col gap-2">
      {count > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl bg-danger p-4 text-on-button-ink animate-pulse motion-reduce:animate-none"
        >
          <BellIcon size={32} />
          <p className="font-heading text-h2 font-extrabold">
            {count === 1 ? t('alert.title') : t('alert.many', { count })}
          </p>
        </div>
      ) : null}
      {soundOn ? (
        <p className="flex items-center gap-2 text-caption text-text-muted">
          <SpeakerIcon size={16} /> {t('alert.soundOn')}
        </p>
      ) : (
        <div>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              void unlockSound().then((ok) => {
                setSoundOn(ok);
                if (ok) playChime();
              });
            }}
          >
            <SpeakerIcon size={16} /> {t('alert.enableSound')}
          </Button>
        </div>
      )}
    </div>
  );
}
