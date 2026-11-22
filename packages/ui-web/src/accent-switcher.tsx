'use client';

import { ACCENTS, type AccentName } from '@delyva/design-tokens';
import { type ReactElement, useEffect, useState } from 'react';
import { applyAccent, parseAccent } from './accent.js';
import { AccentPicker, type AccentPickerProps } from './accent-picker.js';

/** Props for {@link AccentSwitcher}: the picker minus the controlled value/handler. */
export type AccentSwitcherProps = Omit<AccentPickerProps, 'value' | 'onChange' | 'options'>;

/**
 * Stateful accent picker: reads the active `<html data-accent>` on mount, and on change updates the
 * attribute and the `dl_accent` cookie immediately (no reload, no flash on the next request).
 */
export function AccentSwitcher(props: AccentSwitcherProps): ReactElement {
  const [accent, setAccent] = useState<AccentName>('green');
  useEffect(() => {
    setAccent(parseAccent(document.documentElement.getAttribute('data-accent')));
  }, []);
  return (
    <AccentPicker
      {...props}
      options={ACCENTS}
      value={accent}
      onChange={(next) => {
        setAccent(next);
        applyAccent(next);
      }}
    />
  );
}
