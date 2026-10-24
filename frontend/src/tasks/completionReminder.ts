import type { Task, TaskStatus } from '../api/schemas';

/**
 * The pending changes a completion gesture would apply. `nextStatus` /
 * `nextCriteria` are `undefined` when the gesture leaves that field untouched
 * — e.g. an inline board/list status change carries only the status, while the
 * detail-panel save carries both.
 */
export interface CompletionChange {
  // `| undefined` is explicit so callers can pass a value the type-checker
  // knows may be undefined (e.g. a TaskUpdateBody's optional `status`) under
  // the project's exactOptionalPropertyTypes.
  nextStatus?: TaskStatus | null | undefined;
  nextCriteria?: string | null | undefined;
}

export interface CompletionReminder {
  /** True when the user should be reminded of the criteria before completing. */
  remind: boolean;
  /** The effective completion-criteria text to surface (the post-change value). */
  criteria: string;
}

/**
 * ADR 0060: decide whether a write that would move a task to `complete`
 * warrants surfacing its completion criteria first. A pure function so the
 * rule is unit-testable away from the dialog plumbing.
 *
 * Remind iff the write is a genuine transition INTO `complete` (the task was
 * not already complete), the node is a real task (not a section — a section's
 * status is inferred client-side and is never set by a completion gesture),
 * and there is non-empty completion criteria to surface. An empty-criteria
 * task completes uninterrupted: the reminder surfaces *stated* criteria, it
 * deliberately does not nag users to write them.
 */
export function resolveCompletionReminder(
  task: Pick<Task, 'status' | 'is_section' | 'completion_criteria'>,
  change: CompletionChange,
): CompletionReminder {
  // Effective post-write criteria: untouched → the stored value; an explicit
  // string → that; an explicit null (a clear) → empty.
  const criteria =
    change.nextCriteria === undefined ? task.completion_criteria : (change.nextCriteria ?? '');
  const remind =
    change.nextStatus === 'complete' &&
    task.status !== 'complete' &&
    !task.is_section &&
    criteria.trim().length > 0;
  return { remind, criteria };
}
