'use client';

import type { MenuCategory, MenuItem } from '@delyva/contracts';
import { Button, Dialog, FormTextField } from '@delyva/ui-web';
import { type ReactNode, type SyntheticEvent, useState } from 'react';
import { t } from '../../lib/i18n';
import { minorToNairaInput, parseNairaToMinor } from '../../lib/money';

/** Values from the item form (price already in kobo). */
export interface ItemFormValues {
  readonly name: string;
  readonly description: string;
  readonly priceMinor: number;
  readonly categoryId: string;
}

/** Create/edit item dialog. Prices are typed in naira and converted to kobo without floats. */
export function ItemDialog({
  open,
  item,
  categories,
  busy,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly item: MenuItem | null;
  readonly categories: readonly MenuCategory[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (v: ItemFormValues) => void;
}): ReactNode {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? minorToNairaInput(item.price.amountMinor) : '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: SyntheticEvent): void {
    e.preventDefault();
    const priceMinor = parseNairaToMinor(price);
    if (priceMinor === null) {
      setError(t('menu.priceInvalid'));
      return;
    }
    onSave({ name: name.trim(), description: description.trim(), priceMinor, categoryId });
  }

  return (
    <Dialog open={open} title={item ? t('menu.edit') : t('menu.addItem')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormTextField
          label={t('menu.itemName')}
          value={name}
          required
          minLength={2}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <FormTextField
          label={t('menu.description')}
          value={description}
          maxLength={500}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
        <FormTextField
          label={t('menu.price')}
          value={price}
          inputMode="decimal"
          error={error}
          onChange={(e) => {
            setPrice(e.target.value);
            setError(null);
          }}
        />
        <label className="flex flex-col gap-1 text-caption font-semibold">
          {t('menu.category')}
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
            }}
            className="h-12 rounded-lg border border-line bg-surface px-3 text-body text-text"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="brand" loading={busy} disabled={name.trim().length < 2}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Parsed option-group input. */
export interface GroupFormValues {
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly { name: string; priceDeltaMinor: number }[];
}

/** Parses "Name, price" lines into options; null when any line is invalid. */
export function parseOptionLines(text: string): GroupFormValues['options'] | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out: { name: string; priceDeltaMinor: number }[] = [];
  for (const line of lines) {
    const idx = line.lastIndexOf(',');
    const name = (idx < 0 ? line : line.slice(0, idx)).trim();
    const price = idx < 0 ? 0 : parseNairaToMinor(line.slice(idx + 1));
    if (name.length < 2 || price === null) return null;
    out.push({ name, priceDeltaMinor: price });
  }
  return out.length > 0 ? out : null;
}

/** Add option group dialog. */
export function GroupDialog({
  open,
  busy,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (v: GroupFormValues) => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('1');
  const [lines, setLines] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: SyntheticEvent): void {
    e.preventDefault();
    const options = parseOptionLines(lines);
    const minSelect = Number(min);
    const maxSelect = Number(max);
    const ok =
      options &&
      name.trim().length >= 2 &&
      Number.isInteger(minSelect) &&
      Number.isInteger(maxSelect) &&
      minSelect >= 0 &&
      maxSelect >= 1 &&
      minSelect <= maxSelect &&
      maxSelect <= options.length;
    if (!ok) {
      setError(t('menu.groupInvalid'));
      return;
    }
    onSave({ name: name.trim(), minSelect, maxSelect, options });
  }

  return (
    <Dialog open={open} title={t('menu.addModifierGroup')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormTextField
          label={t('menu.groupName')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormTextField
            label={t('menu.groupMin')}
            inputMode="numeric"
            value={min}
            onChange={(e) => {
              setMin(e.target.value);
            }}
          />
          <FormTextField
            label={t('menu.groupMax')}
            inputMode="numeric"
            value={max}
            onChange={(e) => {
              setMax(e.target.value);
            }}
          />
        </div>
        <label className="flex flex-col gap-1 text-caption font-semibold">
          {t('menu.groupOptions')}
          <textarea
            value={lines}
            rows={4}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setLines(e.target.value);
              setError(null);
            }}
            className="rounded-lg border border-line bg-surface p-3 text-body text-text"
          />
        </label>
        {error ? (
          <p role="alert" className="text-caption font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="brand" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
