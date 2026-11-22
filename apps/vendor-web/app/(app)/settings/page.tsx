'use client';

import { SignOutIcon, SpeakerIcon } from '@delyva/icons/web';
import { Button, Switch } from '@delyva/ui-web';
import { type ReactNode, useEffect, useState } from 'react';
import { signOut } from '../../../components/app-shell';
import { playChime, unlockSound } from '../../../lib/client/alert-sound';
import { useVendor } from '../../../lib/client/providers';
import { setTheme, storedTheme, type ThemePref } from '../../../lib/client/theme';
import { type MessageKey, t } from '../../../lib/i18n';

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];

/**
 * Store settings.
 * DEBT(catalog): no busy-mode/pause endpoint — the toggle is a disabled placeholder — add PUT /v1/vendors/{id}/branches/{branchId}/busy with an expiry.
 */
export default function SettingsPage(): ReactNode {
  const { vendors, vendor, select } = useVendor();
  const [theme, setThemeState] = useState<ThemePref>('system');
  useEffect(() => {
    setThemeState(storedTheme());
  }, []);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-h1 font-extrabold">{t('settings.title')}</h1>
      {vendors.length > 1 ? (
        <label className="flex flex-col gap-1 text-caption font-semibold">
          {t('settings.store')}
          <select
            value={vendor?.id}
            onChange={(e) => {
              select(e.target.value);
            }}
            className="h-12 rounded-lg border border-line bg-surface px-3 text-body text-text"
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <p className="text-body font-semibold">{t('settings.busy')}</p>
          <p className="text-caption text-text-muted">{t('settings.busyHint')}</p>
        </div>
        <Switch checked={false} disabled label={t('settings.busy')} onChange={() => undefined} />
      </div>
      <fieldset className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <legend className="text-body font-semibold">{t('settings.theme')}</legend>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((th) => (
            <button
              key={th}
              type="button"
              aria-pressed={theme === th}
              onClick={() => {
                setTheme(th);
                setThemeState(th);
              }}
              className={`h-12 rounded-pill border px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-primary ${theme === th ? 'border-primary bg-primary text-on-primary' : 'border-line bg-bg text-text'}`}
            >
              {t(`settings.theme.${th}` as MessageKey)}
            </button>
          ))}
        </div>
      </fieldset>
      <Button
        variant="soft"
        onClick={() => {
          void unlockSound().then((ok) => {
            if (ok) playChime();
          });
        }}
      >
        <SpeakerIcon size={20} /> {t('settings.sound')}
      </Button>
      <Button variant="danger" size="lg" onClick={() => void signOut()}>
        <SignOutIcon size={20} /> {t('settings.logout')}
      </Button>
    </div>
  );
}
