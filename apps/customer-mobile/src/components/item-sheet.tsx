import type { MenuItem, ModifierGroup } from '@delyva/contracts';
import { MAX_LINE_QUANTITY } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { MinusIcon, PlusIcon } from '@delyva/icons/native';
import {
  AppText,
  BottomSheet,
  Button,
  ChoiceRow,
  QuantityStepper,
  usePalette,
} from '@delyva/ui-native';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  checkSelections,
  emptySelections,
  previewMinor,
  type Selections,
  selectedOptionIds,
  toggleOption,
} from '../features/modifiers';
import { formatMinor } from '../features/money';
import { t } from '../i18n';

/** What the sheet hands back when the customer adds the item. */
export interface ItemChoice {
  readonly item: MenuItem;
  readonly optionIds: string[];
  readonly optionNames: string[];
  readonly quantity: number;
  readonly unitPreviewMinor: number;
}

/** ItemSheet props. */
export interface ItemSheetProps {
  readonly item: MenuItem | null;
  readonly onClose: () => void;
  readonly onAdd: (choice: ItemChoice) => void;
  readonly adding?: boolean;
}

function ruleText(g: ModifierGroup): string {
  if (g.minSelect === g.maxSelect) return t('item.choose', { count: g.minSelect });
  if (g.minSelect === 0) return t('item.chooseUpTo', { count: g.maxSelect });
  return t('item.chooseRange', { min: g.minSelect, max: g.maxSelect });
}

function GroupBlock(props: {
  readonly group: ModifierGroup;
  readonly selections: Selections;
  readonly showError: boolean;
  readonly onToggle: (optionId: string) => void;
  readonly problem: string | null;
}): ReactElement {
  const { group, selections, showError, onToggle, problem } = props;
  const picked = selections[group.id] ?? [];
  return (
    <View style={{ gap: tokens.space[2] }} testID={`group-${group.id}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="h3">{group.name}</AppText>
        <AppText variant="caption" tone="muted">
          {`${ruleText(group)} · ${group.minSelect > 0 ? t('item.required') : t('item.optional')}`}
        </AppText>
      </View>
      {group.options.map((o) => (
        <ChoiceRow
          key={o.id}
          testID={`option-${o.id}`}
          label={o.name}
          detail={
            o.available
              ? o.priceDelta.amountMinor > 0
                ? `+${formatMinor(o.priceDelta.amountMinor)}`
                : t('item.included')
              : t('menu.soldOut')
          }
          kind={group.maxSelect === 1 ? 'radio' : 'checkbox'}
          selected={picked.includes(o.id)}
          disabled={!o.available}
          onPress={() => {
            onToggle(o.id);
          }}
        />
      ))}
      {showError && problem ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}

/** Item detail sheet: modifier groups with min/max validation, quantity and "Add to cart". */
export function ItemSheet({ item, onClose, onAdd, adding = false }: ItemSheetProps): ReactElement {
  const c = usePalette();
  const [selections, setSelections] = useState<Selections>({});
  const [quantity, setQuantity] = useState(1);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (item) setSelections(emptySelections(item));
    setQuantity(1);
    setTouched(false);
  }, [item]);
  const check = useMemo(
    () => (item ? checkSelections(item, selections) : { valid: false, problems: {} }),
    [item, selections],
  );
  const price = item ? previewMinor(item, selections, quantity) : 0;
  const submit = (): void => {
    setTouched(true);
    if (!item || !check.valid) return;
    const ids = selectedOptionIds(item, selections);
    const names = item.modifierGroups.flatMap((g) =>
      g.options.filter((o) => ids.includes(o.id)).map((o) => o.name),
    );
    onAdd({
      item,
      optionIds: ids,
      optionNames: names,
      quantity,
      unitPreviewMinor: previewMinor(item, selections, 1),
    });
  };
  return (
    <BottomSheet
      visible={item !== null}
      onClose={onClose}
      closeLabel={t('common.close')}
      testID="item-sheet"
      footer={
        <View style={{ flexDirection: 'row', gap: tokens.space[3], alignItems: 'center' }}>
          <QuantityStepper
            testID="item-qty"
            value={quantity}
            onChange={setQuantity}
            max={MAX_LINE_QUANTITY}
            decrementLabel={t('item.decrease')}
            incrementLabel={t('item.increase')}
            decrementIcon={<MinusIcon size={20} color={c.text} />}
            incrementIcon={<PlusIcon size={20} color={c.text} />}
          />
          <View style={{ flex: 1 }}>
            <Button
              label={t('item.addToCart', { price: formatMinor(price) })}
              variant="brand"
              size="lg"
              loading={adding}
              disabled={touched && !check.valid}
              onPress={submit}
            />
          </View>
        </View>
      }
    >
      {item ? (
        <>
          <AppText variant="h2">{item.name}</AppText>
          {item.description ? <AppText tone="muted">{item.description}</AppText> : null}
          <AppText variant="h3" numeric>
            {formatMinor(item.price.amountMinor)}
          </AppText>
          {item.modifierGroups.map((g) => {
            const p = check.problems[g.id];
            const problem = p
              ? p.kind === 'min'
                ? t('item.errorMin', { count: p.count })
                : t('item.errorMax', { count: p.count })
              : null;
            return (
              <GroupBlock
                key={g.id}
                group={g}
                selections={selections}
                showError={touched}
                problem={problem}
                onToggle={(optionId) => {
                  setSelections((s) => toggleOption(g, s, optionId));
                }}
              />
            );
          })}
        </>
      ) : null}
    </BottomSheet>
  );
}
