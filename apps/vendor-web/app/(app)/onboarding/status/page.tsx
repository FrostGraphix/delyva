'use client';

import { ClockIcon } from '@delyva/icons/web';
import { Badge, Button, buttonClassName, ErrorState, SkeletonList } from '@delyva/ui-web';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '../../../../components/app-shell';
import { type MessageKey, t } from '../../../../lib/i18n';
import { useApplication } from '../../../../lib/client/application';

/** Application status (pending review / approved / rejected). */
export default function ApplicationStatusPage(): ReactNode {
  const q = useApplication();
  if (q.isPending) return <SkeletonList rows={2} label={t('common.loading')} />;
  if (q.isError)
    return (
      <ErrorState
        title={t('onboarding.loadError')}
        action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
      />
    );
  const app = q.data;
  const tone =
    app.status === 'approved' ? 'success' : app.status === 'rejected' ? 'danger' : 'warning';
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="font-heading text-h1 font-extrabold">{t('status.title')}</h1>
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
        <span className="text-accent-text">
          <ClockIcon size={32} />
        </span>
        <Badge tone={tone}>{t(`status.app.${app.status}` as MessageKey)}</Badge>
        {app.status === 'pending_review' ? (
          <p className="text-body text-text-muted">{t('status.reviewHint')}</p>
        ) : null}
        {app.rejectionReason ? (
          <p className="text-body">{t('status.reason', { reason: app.rejectionReason })}</p>
        ) : null}
        {app.status === 'in_progress' || app.status === 'not_started' ? (
          <Link href="/onboarding" className={buttonClassName('brand', 'md')}>
            {t('status.continue')}
          </Link>
        ) : null}
        {app.status === 'approved' ? (
          <Button variant="brand" onClick={() => void signOut()}>
            {t('settings.logout')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
