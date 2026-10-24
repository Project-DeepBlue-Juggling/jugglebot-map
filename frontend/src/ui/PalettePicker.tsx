import clsx from 'clsx';
import { PALETTE } from './palette';

interface Props {
  /** Currently selected hex value (`null` means "no colour"). */
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  ariaLabel: string;
}

/**
 * 13-swatch grid (12 palette colours + "no colour"); single source of
 * truth for both the per-task picker in `TaskDetailPanel` and the
 * per-user picker in the profile popover (ADR 0016).
 *
 * Accessible: each swatch is a button with an `aria-label` (the colour
 * name or "No colour") and `aria-pressed` reflecting selection. The
 * grid is keyboard-navigable via Tab and triggered with Space / Enter.
 */
export function PalettePicker({ value, onChange, disabled = false, ariaLabel }: Props) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {PALETTE.map((entry) => {
        const selected = value === entry.hex;
        return (
          <button
            key={entry.hex}
            type="button"
            disabled={disabled}
            aria-label={entry.name}
            aria-pressed={selected}
            title={entry.name}
            onClick={() => onChange(entry.hex)}
            style={{ backgroundColor: entry.hex }}
            className={clsx(
              'h-6 w-6 rounded-full transition-shadow',
              selected
                ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-slate-100 dark:ring-offset-slate-900'
                : 'hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          />
        );
      })}
      <button
        type="button"
        disabled={disabled}
        aria-label="No colour"
        aria-pressed={value === null}
        title="No colour"
        onClick={() => onChange(null)}
        className={clsx(
          'relative grid h-6 w-6 place-items-center rounded-full border border-slate-300 bg-white transition-shadow dark:border-slate-600 dark:bg-slate-800',
          value === null
            ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-slate-100 dark:ring-offset-slate-900'
            : 'hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {/* Diagonal slash to signal "none" without text */}
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center text-slate-400 dark:text-slate-500"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      </button>
    </div>
  );
}
