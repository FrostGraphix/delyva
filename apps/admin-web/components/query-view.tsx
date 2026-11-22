'use client';
import { ArrowClockwiseIcon } from '@delyva/icons/web';
import { Alert, Button, EmptyState, Skeleton } from '@delyva/ui-web';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage, isForbidden } from '@/lib/client/errors';
import { t } from '@/lib/i18n';

/** Query view props. */
export interface QueryViewProps<T> {
  readonly query: UseQueryResult<T>;
  /** What is loading, for the skeleton's label. */
  readonly what: string;
  /** True when the loaded data is empty. */
  readonly isEmpty: (data: T) => boolean;
  /** Empty state (illustration + one action). */
  readonly empty: ReactNode;
  readonly children: (data: T) => ReactNode;
}

/** Renders loading (skeleton), error (+ retry), no-access, empty and success states. */
export function QueryView<T>({
  query,
  what,
  isEmpty,
  empty,
  children,
}: QueryViewProps<T>): ReactNode {
  if (query.isPending) return <Skeleton label={t('common.loading', { what })} lines={4} />;
  if (query.isError && query.data === undefined) {
    if (isForbidden(query.error)) {
      return (
        <Alert tone="warning" title={t('common.noAccessTitle')}>
          {t('common.noAccessBody')}
        </Alert>
      );
    }
    return (
      <Alert
        tone="danger"
        title={t('common.errorTitle')}
        action={
          <Button size="sm" variant="soft" onClick={() => void query.refetch()}>
            <ArrowClockwiseIcon size={16} />
            {t('common.retry')}
          </Button>
        }
      >
        {errorMessage(query.error)}
      </Alert>
    );
  }
  if (query.data === undefined) return null;
  if (isEmpty(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

/** Empty state with the console's default illustration. */
export function EmptyBlock({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}): ReactNode {
  return <EmptyState title={title} description={body} action={action} />;
}
