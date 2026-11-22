'use client';
import type { ReactElement } from 'react';

/** Labelled native checkbox with a 48 px touch row. */
export function Checkbox({
  id,
  label,
  checked,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <label htmlFor={id} className="flex min-h-12 items-center gap-3 text-body text-text">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        className="size-5 accent-primary"
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}
