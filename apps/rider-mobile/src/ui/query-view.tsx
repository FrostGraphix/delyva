import { Skeleton, StateMessage } from '@delyva/ui-native';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { t } from '../i18n';

/** Renders loading (skeleton), error (message + retry) or the data of a query. */
export function QueryView<T>({
  query,
  children,
  rows = 3,
}: {
  query: UseQueryResult<T, unknown>;
  children: (data: T) => ReactElement;
  rows?: number;
}): ReactElement {
  if (query.data !== undefined) return children(query.data);
  if (query.isError) {
    return (
      <StateMessage
        testID="error-state"
        tone="danger"
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        actionLabel={t('common.retry')}
        onAction={() => {
          void query.refetch();
        }}
      />
    );
  }
  return <Skeleton rows={rows} label={t('common.loading')} />;
}
