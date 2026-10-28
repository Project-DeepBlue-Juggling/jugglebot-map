import clsx from 'clsx';

export const LABEL = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';
const UNCHOSEN =
  'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700';

/**
 * One choice as a row of pill buttons (owner, 2026-10-27, JB-71). Native radios
 * under the pills keep the keyboard behaviour: Tab lands on the chosen pill, the
 * arrow keys move and choose, Tab moves on.
 */
export function Pills<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  text,
  tone,
  autoFocus = false,
  small = false,
  hideLabel = false,
}: {
  id: string;
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  text: (v: T) => string;
  /** Classes for the chosen pill. */
  tone: (v: T) => string;
  autoFocus?: boolean;
  /** Tighter pills, for the drawer's property rows. */
  small?: boolean;
  /** Keep the label for screen readers only (the caller shows its own). */
  hideLabel?: boolean;
}) {
  return (
    <div>
      <span id={`${id}-label`} className={hideLabel ? 'sr-only' : LABEL}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="radio"
              name={id}
              value={o}
              checked={o === value}
              onChange={() => onChange(o)}
              autoFocus={autoFocus && o === value}
              className="peer sr-only"
            />
            <span
              className={clsx(
                small
                  ? 'inline-block rounded-full border px-2 py-0.5 text-xs'
                  : 'inline-block rounded-full border px-3 py-1 text-sm',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-1 dark:peer-focus-visible:ring-offset-slate-800',
                o === value ? clsx('border-transparent font-medium', tone(o)) : UNCHOSEN,
              )}
            >
              {text(o)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
