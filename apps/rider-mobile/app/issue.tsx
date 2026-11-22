import { Card, Typography } from '@delyva/ui-native';
import type { ReactElement } from 'react';
import { t } from '../src/i18n';
import { RiderNav } from '../src/ui/rider-nav';
import { Screen } from '../src/ui/screen';

/**
 * SOS / report-issue placeholder.
 * DEBT(engagement): no SOS or support-ticket endpoint yet — wire to engagement support tickets + ops alerting.
 */
export default function IssueScreen(): ReactElement {
  return (
    <Screen testID="screen-issue" title={t('issue.title')} nav={<RiderNav active="issue" />}>
      <Card testID="sos-card">
        <Typography variant="h2">{t('issue.sos')}</Typography>
        <Typography tone="muted">{t('issue.body')}</Typography>
      </Card>
    </Screen>
  );
}
