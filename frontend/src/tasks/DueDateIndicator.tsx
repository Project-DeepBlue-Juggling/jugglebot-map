import clsx from 'clsx';
import type { DueStatus } from './dueStatus';

/**
 * Shared due-soon / OVERDUE affordance (ADR 0026 §Indicator UI).
 *
 * The classifier emits five labels, but only two render anything:
 * `due-soon` produces a `⚠` icon and `overdue` produces a red `OVERDUE` pill.
 * The other three (`complete`, `no-date`, `normal`) return `null` so callers
 * can drop this in unconditionally — the absence of a wrapper element keeps
 * the surrounding flex / grid layout from gaining empty slots.
 *
 * The pill style matches the existing status pills (small, rounded, white
 * text on a saturated background) so it reads as the same family of
 * affordance the user already understands.
 */
interface Props {
  status: DueStatus;
  /** Tooltip text, e.g. the formatted due date. Optional so callers can omit
   *  it when the surrounding row already shows the date plainly. */
  title?: string;
  /** Visual scale. `sm` is the canvas-node + list-row size; `md` is the
   *  detail-panel header size. */
  size?: 'sm' | 'md';
  className?: string;
}

export default function DueDateIndicator({ status, title, size = 'sm', className }: Props) {
  if (status === 'overdue' || status === 'due-soon') {
    const isOverdue = status === 'overdue';
    const label = isOverdue ? 'Overdue' : 'Due soon';
    return (
      <span
        title={title}
        aria-label={title === undefined ? label : `${label} (${title})`}
        className={clsx(
          'inline-flex items-center rounded-full font-semibold uppercase tracking-wide text-white',
          isOverdue
            ? 'bg-rose-600 dark:bg-rose-500'
            : 'bg-amber-500 dark:bg-amber-400 dark:text-slate-900',
          size === 'sm' ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]',
          className,
        )}
      >
        {label}
      </span>
    );
  }
  return null;
}
