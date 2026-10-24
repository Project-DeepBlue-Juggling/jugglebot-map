import type { TaskStatus } from '../api/schemas';
import { MAP_STATUS_LABELS } from '../theme/palette';

// Every map status (theme/palette.ts STATUSES_BY_KIND) plus the shell's two
// legacy ones. A status outside this set is a server drift and is shown as
// itself.
const KNOWN_LABELS: Record<string, string> = {
  ...MAP_STATUS_LABELS,
  blocked: 'Blocked',
  qa: 'QA',
};

/** Known statuses get a label; any other server status is shown as itself. */
export const STATUS_LABELS: Record<string, string> = new Proxy(KNOWN_LABELS, {
  get: (t, k) => (typeof k === 'string' ? (t[k] ?? k) : undefined),
});

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
const SETTLED: ReadonlySet<string> = new Set([
  'complete',
  'completed',
  'dropped',
  'archived',
  'superseded',
  'deferred',
  'retired',
  'promoted',
]);

export function isSettledStatus(status: TaskStatus): boolean {
  return SETTLED.has(status);
}
