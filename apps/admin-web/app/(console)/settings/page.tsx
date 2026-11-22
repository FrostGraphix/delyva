'use client';
import { AccentSwitcher } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { t } from '@/lib/i18n';

/** Console appearance settings: accent theme (a per-browser UI preference, stored in a cookie). */
export default function SettingsPage(): ReactNode {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <AccentSwitcher
        legend={t('settings.accent')}
        selectedLabel={t('settings.accent.selected')}
        labels={{ green: t('settings.accent.green'), orange: t('settings.accent.orange') }}
      />
    </div>
  );
}
