import { tokens } from '@delyva/design-tokens';
import { PriceRow, usePalette } from '@delyva/ui-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { BreakdownRow } from '../features/breakdown';
import { formatMinor } from '../features/money';
import { t } from '../i18n';

/** PriceBreakdown props. */
export interface PriceBreakdownProps {
  /** Server-computed rows (quote or order totals). */
  readonly rows: readonly BreakdownRow[];
}

/** Full price (items, delivery, service fee, discounts, VAT, total) shown before paying. */
export function PriceBreakdown({ rows }: PriceBreakdownProps): ReactElement {
  const c = usePalette();
  return (
    <View testID="price-breakdown" style={{ gap: tokens.space[1] }}>
      {rows.map((r) => (
        <View
          key={r.key}
          style={
            r.emphasis
              ? { borderTopWidth: 1, borderTopColor: c.line, marginTop: tokens.space[2], paddingTop: tokens.space[2] }
              : undefined
          }
        >
          <PriceRow
            testID={`price-${r.key}`}
            label={t(r.key)}
            value={formatMinor(r.amountMinor)}
            emphasis={r.emphasis === true}
            tone={r.amountMinor < 0 ? 'accent' : 'default'}
          />
        </View>
      ))}
    </View>
  );
}
