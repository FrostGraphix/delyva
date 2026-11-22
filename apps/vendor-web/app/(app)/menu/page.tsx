'use client';

import type { MenuCategory, MenuItem } from '@delyva/contracts';
import { ListIcon, PlusIcon } from '@delyva/icons/web';
import { ApiError } from '@delyva/sdk';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SkeletonList,
  Switch,
  useToast,
} from '@delyva/ui-web';
import { type ReactNode, useState } from 'react';
import {
  GroupDialog,
  type GroupFormValues,
  ItemDialog,
  type ItemFormValues,
} from '../../../components/menu/item-dialogs';
import { browserClient } from '../../../lib/client/api';
import { useCatalogWrite, useVendorDetail } from '../../../lib/client/catalog';
import { useCurrentVendor } from '../../../lib/client/providers';
import { t } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/money';

type Editing = { kind: 'item'; item: MenuItem | null } | { kind: 'group'; item: MenuItem } | null;

const NGN = 'NGN' as const;

function errText(err: unknown): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : t('common.error');
}

/** Menu manager (M11): items, prices, options and sold-out toggles. */
export default function MenuPage(): ReactNode {
  const vendor = useCurrentVendor();
  const q = useVendorDetail(vendor.id);
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [intent, setIntent] = useState(() => crypto.randomUUID());
  const c = browserClient();

  const done = (msg: string) => () => {
    setEditing(null);
    setIntent(crypto.randomUUID());
    toast.show(msg);
  };
  const fail = (err: unknown): void => {
    toast.show(errText(err), 'danger');
  };
  const saveItem = useCatalogWrite(vendor.id, (v: ItemFormValues & { id: string | null }, key) => {
    const price = { amountMinor: v.priceMinor, currency: NGN };
    return v.id
      ? c.updateMenuItem(
          vendor.id,
          v.id,
          { name: v.name, description: v.description || null, price, categoryId: v.categoryId },
          key,
        )
      : c.createMenuItem(
          vendor.id,
          {
            name: v.name,
            ...(v.description ? { description: v.description } : {}),
            price,
            categoryId: v.categoryId,
          },
          key,
        );
  });
  const toggle = useCatalogWrite(
    vendor.id,
    async (v: { itemId?: string; optionId?: string; available: boolean }, key): Promise<void> => {
      if (v.optionId) {
        await c.setModifierOptionAvailability(vendor.id, v.optionId, { available: v.available }, key);
      } else if (v.itemId) {
        await c.setItemAvailability(vendor.id, v.itemId, { available: v.available }, key);
      }
    },
  );
  const addGroup = useCatalogWrite(vendor.id, (v: GroupFormValues & { itemId: string }, key) =>
    c.createModifierGroup(
      vendor.id,
      v.itemId,
      {
        name: v.name,
        minSelect: v.minSelect,
        maxSelect: v.maxSelect,
        options: v.options.map((o) => ({
          name: o.name,
          priceDelta: { amountMinor: o.priceDeltaMinor, currency: NGN },
        })),
      },
      key,
    ),
  );

  if (q.isPending) return <SkeletonList rows={5} label={t('menu.loading')} />;
  if (q.isError) {
    return (
      <ErrorState
        title={t('menu.loadError')}
        action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
      />
    );
  }
  const categories = q.data.menu.categories;
  const count = categories.reduce((n, cat) => n + cat.items.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h1 font-extrabold">{t('menu.title')}</h1>
        <Button
          variant="brand"
          disabled={categories.length === 0}
          onClick={() => {
            setEditing({ kind: 'item', item: null });
          }}
        >
          <PlusIcon size={20} /> {t('menu.addItem')}
        </Button>
      </header>
      <p className="text-caption text-text-muted">{t('menu.categoriesDebt')}</p>
      {count === 0 ? (
        <EmptyState
          title={t('menu.empty')}
          message={t('menu.emptyHint')}
          icon={<ListIcon size={32} />}
        />
      ) : (
        categories.map((cat) => (
          <Category
            key={cat.id}
            category={cat}
            onEdit={(item) => {
              setEditing({ kind: 'item', item });
            }}
            onAddGroup={(item) => {
              setEditing({ kind: 'group', item });
            }}
            onToggle={(v, label) => {
              toggle.mutate(
                { ...v, key: crypto.randomUUID() },
                {
                  onSuccess: () => {
                    toast.show(
                      v.available
                        ? t('menu.availabilityOn', { name: label })
                        : t('menu.availabilityOff', { name: label }),
                    );
                  },
                  onError: fail,
                },
              );
            }}
          />
        ))
      )}
      {editing?.kind === 'item' ? (
        <ItemDialog
          open
          item={editing.item}
          categories={categories}
          busy={saveItem.isPending}
          onClose={() => {
            setEditing(null);
          }}
          onSave={(v) => {
            saveItem.mutate(
              { ...v, id: editing.item?.id ?? null, key: intent },
              { onSuccess: done(t('menu.saved', { name: v.name })), onError: fail },
            );
          }}
        />
      ) : null}
      {editing?.kind === 'group' ? (
        <GroupDialog
          open
          busy={addGroup.isPending}
          onClose={() => {
            setEditing(null);
          }}
          onSave={(v) => {
            addGroup.mutate(
              { ...v, itemId: editing.item.id, key: intent },
              { onSuccess: done(t('menu.groupSaved', { name: v.name })), onError: fail },
            );
          }}
        />
      ) : null}
    </div>
  );
}

function Category({
  category,
  onEdit,
  onAddGroup,
  onToggle,
}: {
  readonly category: MenuCategory;
  readonly onEdit: (i: MenuItem) => void;
  readonly onAddGroup: (i: MenuItem) => void;
  readonly onToggle: (
    v: { itemId?: string; optionId?: string; available: boolean },
    label: string,
  ) => void;
}): ReactNode {
  return (
    <section aria-labelledby={`cat-${category.id}`} className="flex flex-col gap-2">
      <h2 id={`cat-${category.id}`} className="font-heading text-h3 font-bold">
        {category.name}
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {category.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 p-4"
            data-testid={`menu-item-${item.id}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold">{item.name}</p>
                <p className="text-caption text-text-muted">{formatMoney(item.price)}</p>
              </div>
              <Badge tone={item.available ? 'success' : 'danger'}>
                {item.available ? t('menu.inStock') : t('menu.soldOut')}
              </Badge>
              <Switch
                checked={item.available}
                label={t('menu.available', { name: item.name })}
                onChange={(v) => {
                  onToggle({ itemId: item.id, available: v }, item.name);
                }}
              />
              <Button
                variant="soft"
                size="sm"
                onClick={() => {
                  onEdit(item);
                }}
                aria-label={`${t('menu.edit')} ${item.name}`}
              >
                {t('menu.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onAddGroup(item);
                }}
                aria-label={`${t('menu.addModifierGroup')}: ${item.name}`}
              >
                <PlusIcon size={16} /> {t('menu.modifiers')}
              </Button>
            </div>
            {item.modifierGroups.map((g) => (
              <div key={g.id} className="ml-4 flex flex-col gap-1 border-l-2 border-line pl-3">
                <p className="text-caption font-semibold">{g.name}</p>
                {g.options.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 text-caption">
                    <span>
                      {o.name} · {formatMoney(o.priceDelta)}
                    </span>
                    <Switch
                      checked={o.available}
                      label={t('menu.available', { name: o.name })}
                      onChange={(v) => {
                        onToggle({ optionId: o.id, available: v }, o.name);
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
