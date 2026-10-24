/**
 * Pure due-date status classifier (ADR 0026 §Indicator UI).
 *
 * The classifier returns one of five labels that drive every task-rendering
 * surface (list row, canvas node, detail panel, timeline bar). The rules:
 *
 *   - `complete`  — `status === 'complete'`. Hides both indicators regardless
 *                   of the due date.
 *   - `dropped`   — `status === 'dropped'` (ADR 0075). Hides them for the same
 *                   reason: a task nobody will ever do cannot be late. Kept as
 *                   its own label rather than folded into `complete`, so no
 *                   caller has to read "complete" and know it may mean
 *                   "abandoned". Like `complete`, it renders nothing.
 *   - `overdue`   — `due_date < today` AND the task is not settled.
 *   - `due-soon`  — `due_date >= today` AND `due_date - today <=
 *                   project.due_date_warning_days` AND not settled.
 *   - `no-date`   — `due_date === null`.
 *   - `normal`    — has a future due_date past the warning window.
 *
 * Overdue subsumes due-soon — the labels are mutually exclusive, matching
 * the ADR's "the OVERDUE pill replaces the warning exclamation" rule.
 *
 * The function is pure: it takes the current date as a parameter so callers
 * can pin it in tests. UI surfaces resolve `today` from `new Date()` once
 * at render time and pass the same instant down to every consumer.
 */

import type { Project, Task } from '../api/schemas';

export type DueStatus = 'complete' | 'dropped' | 'overdue' | 'due-soon' | 'no-date' | 'normal';

/** Round a Date down to UTC midnight. The day-bucket boundary is what drives
 *  overdue / due-soon decisions; the time-of-day on `due_date` is ignored. */
function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Days between two UTC-midnight epoch values (positive when `b` is after `a`). */
function daysBetween(aMs: number, bMs: number): number {
  return Math.round((bMs - aMs) / 86_400_000);
}

export function dueStatus(
  task: Pick<Task, 'due_date' | 'status'>,
  project: Pick<Project, 'due_date_warning_days'>,
  now: Date,
): DueStatus {
  if (task.status === 'complete') return 'complete';
  if (task.status === 'dropped') return 'dropped';
  if (task.due_date === null) return 'no-date';

  const today = startOfUtcDay(now);
  const due = startOfUtcDay(new Date(task.due_date));
  const delta = daysBetween(today, due);

  if (delta < 0) return 'overdue';
  if (delta <= project.due_date_warning_days) return 'due-soon';
  return 'normal';
}

/** Render the date portion of a task's `due_date` for compact column display.
 *  Returns the literal em-dash for null; uses the locale's short date format
 *  for non-null values. Matches the existing "—" sentinel used elsewhere in
 *  the list view for null fields (Assignee, Parent). */
export function formatDueDate(due_date: string | null): string {
  if (due_date === null) return '—';
  return new Date(due_date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Convert an HTML `<input type="date">` value (`YYYY-MM-DD`, no time) to the
 *  ISO datetime the API expects. We anchor at UTC midnight: matches the
 *  classifier's day-bucketing so a date picked on the calendar is treated
 *  consistently regardless of the user's local time zone. Empty string → null
 *  so the form's "clear the date" affordance maps cleanly to the wire null. */
export function dateInputToIso(value: string): string | null {
  if (value === '') return null;
  return `${value}T00:00:00.000Z`;
}

/** Inverse of `dateInputToIso`: extract the `YYYY-MM-DD` portion suitable
 *  for an `<input type="date">`'s `value` prop. Null → empty string. */
export function isoToDateInput(due_date: string | null): string {
  if (due_date === null) return '';
  return due_date.slice(0, 10);
}
