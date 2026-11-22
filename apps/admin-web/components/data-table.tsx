'use client';
import { createColumnHelper, tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

/** Table features used by the console (core rows only; sorting/filtering happen server-side). */
export const TABLE_FEATURES = tableFeatures({});

/** Column helper bound to the console's feature set. */
export function columnsFor<T extends object>(): ReturnType<
  typeof createColumnHelper<typeof TABLE_FEATURES, T>
> {
  return createColumnHelper<typeof TABLE_FEATURES, T>();
}

/** Column definitions for `DataTable`. */
export type Columns<T extends object> = ColumnDef<typeof TABLE_FEATURES, T>[];

/** Data table props. */
export interface DataTableProps<T extends object> {
  /** Accessible caption (visually hidden). */
  readonly caption: string;
  /** Stable (module-level or memoised) columns. */
  readonly columns: Columns<T>;
  readonly data: readonly T[];
  /** Stable row id (e.g. the entity uuid). */
  readonly rowId: (row: T) => string;
}

/** Semantic, token-styled table built on TanStack Table v9. */
export function DataTable<T extends object>({
  caption,
  columns,
  data,
  rowId,
}: DataTableProps<T>): ReactNode {
  const table = useTable({
    features: TABLE_FEATURES,
    columns,
    data,
    getRowId: (row) => rowId(row),
  });
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-caption">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-bg">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} scope="col" className="px-4 py-3 font-semibold text-text-muted">
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-line bg-surface">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-middle text-text">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
