import { WarningIcon } from '@delyva/icons/native';
import { SkeletonList, StateView, usePalette } from '@delyva/ui-native';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { errorMessage } from '../api/query-client';
import { t } from '../i18n';

/** QueryBoundary props. */
export interface QueryBoundaryProps<T> {
  readonly query: UseQueryResult<T>;
  /** Renders the success state. */
  readonly children: (data: T) => ReactNode;
  /** Rows in the loading skeleton. */
  readonly skeletonRows?: number;
  readonly skeletonHeight?: number;
}

/**
 * Loading (skeleton) → error (plain message + retry) → success, for one query. Cached data
 * keeps rendering while offline or refetching.
 */
export function QueryBoundary<T>({
  query,
  children,
  skeletonRows = 4,
  skeletonHeight,
}: QueryBoundaryProps<T>): ReactElement {
  const c = usePalette();
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    return (
      <StateView
        tone="error"
        testID="error-state"
        illustration={<WarningIcon size={32} color={c.danger} />}
        title={t('common.errorTitle')}
        message={errorMessage(query.error, t('common.errorBody'))}
        actionLabel={t('common.retry')}
        onAction={() => {
          void query.refetch();
        }}
      />
    );
  }
  return (
    <SkeletonList rows={skeletonRows} label={t('common.loading')} rowHeight={skeletonHeight} />
  );
}
