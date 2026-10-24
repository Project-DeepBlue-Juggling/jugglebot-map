import type { TaskPriority } from '../api/schemas';

/**
 * Priority is the optional triage level on a task (ADR 0052). A `null` priority
 * means "no priority" — the quiet default — and renders no pill anywhere. These
 * helpers mirror the status trio (`statusLabels.ts` / `statusStyles.ts`) so the
 * two read the same across the UI.
 */

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Ascending urgency — the detail-panel `<select>` and the List filter read
 *  this order. */
export const PRIORITY_OPTIONS: readonly TaskPriority[] = ['low', 'medium', 'high'] as const;

export interface PriorityStyle {
  pillBg: string;
  pillText: string;
}

export const PRIORITY_STYLES: Record<TaskPriority, PriorityStyle> = {
  low: {
    pillBg: 'bg-slate-100 dark:bg-slate-700',
    pillText: 'text-slate-600 dark:text-slate-300',
  },
  medium: {
    pillBg: 'bg-amber-100 dark:bg-amber-900/40',
    pillText: 'text-amber-800 dark:text-amber-200',
  },
  high: {
    pillBg: 'bg-red-100 dark:bg-red-900/40',
    pillText: 'text-red-800 dark:text-red-200',
  },
};
