import type { TaskStatus } from '../api/schemas';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  qa: 'QA',
  complete: 'Complete',
  dropped: 'Dropped',
};

// Canonical status order (ADR 0052, extended by ADR 0075): the status
// `<select>`, the List filter, and the SectionProgressBar segments read this.
// The Kanban board uses its own curated order, which excludes both `backlog`
// and `dropped` — see BOARD_COLUMNS in board/boardLayout.ts.
export const STATUS_OPTIONS: readonly TaskStatus[] = [
  'backlog',
  'not_started',
  'in_progress',
  'blocked',
  'qa',
  'complete',
  'dropped',
] as const;

/**
 * Statuses that mean "this task is settled — nobody is waiting on it".
 * `complete` (it was done) and `dropped` (it never will be, ADR 0075). Both
 * suppress the overdue/due-soon indicators and desaturate in the views: a
 * task nobody will ever do cannot be late.
 */
export function isSettledStatus(status: TaskStatus): boolean {
  return status === 'complete' || status === 'dropped';
}
