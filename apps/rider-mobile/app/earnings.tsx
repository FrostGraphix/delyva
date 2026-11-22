import { tokens } from '@delyva/design-tokens';
import { useMyRiderEarnings } from '@delyva/sdk';
import { Banner, StatTile, StateMessage } from '@delyva/ui-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { t } from '../src/i18n';
import { formatNaira } from '../src/lib/format';
import { QueryView } from '../src/ui/query-view';
import { RiderNav } from '../src/ui/rider-nav';
import { Screen } from '../src/ui/screen';

/** R12 — earnings from GET /v1/riders/me/earnings. */
export default function EarningsScreen(): ReactElement {
  const earnings = useMyRiderEarnings(api);
  return (
    <Screen
      testID="screen-earnings"
      title={t('earnings.title')}
      nav={<RiderNav active="earnings" />}
    >
      <QueryView query={earnings}>
        {(e) => (
          <>
            <View style={{ flexDirection: 'row', gap: tokens.space[3] }}>
              {/* DEBT(payments): balanceMinor is null until payments exposes a rider_payable read — show the ledger balance then. */}
              <StatTile
                testID="earnings-balance"
                label={t('earnings.balance')}
                value={e.balanceMinor === null ? '—' : formatNaira(e.balanceMinor)}
                caption={e.balanceMinor === null ? t('earnings.balancePending') : undefined}
              />
              <StatTile
                testID="earnings-trips"
                label={t('earnings.trips')}
                value={String(e.completedTrips)}
              />
            </View>
            {e.completedTrips === 0 ? <StateMessage title={t('earnings.empty')} /> : null}
            {/* DEBT(payments): rider cash-out flow not built — needs a payout request endpoint. */}
            <Banner tone="info" text={t('earnings.cashOut')} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
