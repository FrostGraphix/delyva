import { themeColors, type AccentName } from '@delyva/design-tokens';
import type { ReactElement } from 'react';

/** Accent picker props. */
export interface AccentPickerProps {
  /** Visible group label (translated by the app). */
  readonly legend: string;
  /** Translated display name per accent. */
  readonly labels: Readonly<Record<AccentName, string>>;
  /** Accents to offer, in order. */
  readonly options: readonly AccentName[];
  /** Currently selected accent. */
  readonly value: AccentName;
  /** Called with the newly chosen accent. */
  readonly onChange: (accent: AccentName) => void;
  /** Visible word shown on the selected option so selection never relies on colour alone. */
  readonly selectedLabel: string;
  /** Unique name for the radio group. */
  readonly name?: string;
}

/**
 * Accent theme picker: a radio group of swatch + name cards. The selected card also shows a check
 * mark, a heavier border and a text badge, so state is never conveyed by colour alone.
 */
export function AccentPicker({
  legend,
  labels,
  options,
  value,
  onChange,
  selectedLabel,
  name = 'accent',
}: AccentPickerProps): ReactElement {
  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <legend className="text-body font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((accent) => {
          const selected = accent === value;
          return (
            <label
              key={accent}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-2 text-body font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${selected ? 'border-text bg-bg' : 'border-line bg-surface'}`}
            >
              <input
                type="radio"
                name={name}
                value={accent}
                checked={selected}
                onChange={() => {
                  onChange(accent);
                }}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-pill border border-line"
                style={{ backgroundColor: themeColors('light', accent).primary }}
              >
                {selected ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    style={{ color: themeColors('light', accent).onPrimary }}
                  >
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                ) : null}
              </span>
              <span>{labels[accent]}</span>
              {selected ? (
                <span className="rounded-pill bg-bg px-2 text-micro text-text-muted">
                  {selectedLabel}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
