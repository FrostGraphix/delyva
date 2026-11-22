import { CheckCircleIcon, WarningIcon } from '@delyva/icons/native';
import { Button, RiderCard, Typography, useThemeColors } from '@delyva/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '../src/i18n';
import { Screen } from '../src/ui/screen';

/** R11 — trip summary after delivery (or an undeliverable report). */
export default function DeliveredScreen(): ReactElement {
  const c = useThemeColors();
  const { outcome } = useLocalSearchParams<{ outcome?: string }>();
  const failed = outcome === 'undeliverable';
  return (
    <Screen
      testID="screen-delivered"
      footer={
        <Button
          label={t('delivered.home')}
          variant="brand"
          size="lg"
          onPress={() => {
            router.replace('/home');
          }}
        />
      }
    >
      <RiderCard testID={failed ? 'summary-undeliverable' : 'summary-delivered'}>
        {failed ? (
          <WarningIcon size={32} color={c.warning} />
        ) : (
          <CheckCircleIcon size={32} color={c.accentText} />
        )}
        <Typography variant="display" header>
          {failed ? t('delivered.undeliverableTitle') : t('delivered.title')}
        </Typography>
        <Typography tone="muted">
          {failed ? t('delivered.undeliverableBody') : t('delivered.body')}
        </Typography>
      </RiderCard>
    </Screen>
  );
}
