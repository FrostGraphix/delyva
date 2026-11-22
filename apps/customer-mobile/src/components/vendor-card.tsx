import type { VendorSummary } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { ClockIcon, ScooterIcon } from '@delyva/icons/native';
import { AppText, Card, usePalette } from '@delyva/ui-native';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { formatMoney } from '../features/money';
import { t } from '../i18n';
import { CategoryGlyph, categoryLabel } from './category';

/** VendorCard props. */
export interface VendorCardProps {
  readonly vendor: VendorSummary;
  readonly onPress: () => void;
}

function Tag({ icon, label }: { readonly icon?: ReactNode; readonly label: string }): ReactElement {
  const c = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space[1],
        paddingHorizontal: tokens.space[2],
        paddingVertical: tokens.space[1],
        borderRadius: tokens.radius.pill,
        backgroundColor: c.bg,
      }}
    >
      {icon}
      <AppText variant="caption" numeric>
        {label}
      </AppText>
    </View>
  );
}

/** Flat merchant card: category hero tile, name, ETA, fee and distance. */
export function VendorCard({ vendor, onPress }: VendorCardProps): ReactElement {
  const c = usePalette();
  const eta = t('vendor.eta', { min: vendor.etaMinutes });
  const fee = vendor.deliveryFee
    ? t('vendor.fee', { fee: formatMoney(vendor.deliveryFee) })
    : t('vendor.feeAtCheckout');
  const km = (vendor.distanceMeters / 1000).toFixed(1);
  return (
    <Card
      padded={false}
      onPress={onPress}
      testID={`vendor-${vendor.id}`}
      accessibilityLabel={t('vendor.cardLabel', {
        name: vendor.name,
        category: categoryLabel(vendor.category),
        eta,
        fee,
      })}
    >
      <View
        style={{
          height: 112,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tokens.color.mint[100],
        }}
      >
        <CategoryGlyph category={vendor.category} size={32} color={tokens.color.ink[900]} />
      </View>
      <View style={{ padding: tokens.space[4], gap: tokens.space[2] }}>
        <AppText variant="h3">{vendor.name}</AppText>
        <AppText variant="caption" tone="muted">
          {categoryLabel(vendor.category)}
        </AppText>
        <View style={{ flexDirection: 'row', gap: tokens.space[2], flexWrap: 'wrap' }}>
          <Tag icon={<ClockIcon size={16} color={c.text} />} label={eta} />
          <Tag icon={<ScooterIcon size={16} color={c.text} />} label={fee} />
          <Tag label={t('vendor.distance', { km })} />
        </View>
      </View>
    </Card>
  );
}
