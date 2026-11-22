'use client';
import type { ApplicationStatus } from '@delyva/contracts';
import { SelectField } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

/** Reviewable statuses. */
export type ReviewStatus = Exclude<ApplicationStatus, 'not_started'>;

const OPTIONS: readonly ReviewStatus[] = ['pending_review', 'in_progress', 'approved', 'rejected'];

/** Status filter for application queues. */
export function StatusFilter({
  value,
  onChange,
}: {
  readonly value: ReviewStatus;
  readonly onChange: (s: ReviewStatus) => void;
}): ReactNode {
  return (
    <div className="max-w-xs">
      <SelectField
        id="application-status"
        label={t('apps.status')}
        options={OPTIONS.map((s) => ({ value: s, label: t(`apps.status.${s}`) }))}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as ReviewStatus);
        }}
      />
    </div>
  );
}
