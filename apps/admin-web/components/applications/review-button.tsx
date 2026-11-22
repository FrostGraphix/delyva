'use client';
import { Button } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

/** "Review" row action, labelled with the applicant for screen readers. */
export function ReviewButton({
  name,
  onClick,
}: {
  readonly name: string;
  readonly onClick: () => void;
}): ReactNode {
  return (
    <Button size="sm" variant="soft" aria-label={t('apps.reviewOf', { name })} onClick={onClick}>
      {t('apps.review')}
    </Button>
  );
}
