/**
 * Pure Mon-Fri working-day arithmetic (ADR 0059).
 *
 * Mirrors backend/app/services/working_days.py — the backend is the truth
 * (its reschedule paths derive the stored due dates); this copy exists so
 * timeline drags and the form's "Days of work" input can preview the
 * derived due date without a round trip. The two implementations share
 * canonical test vectors (workingDays.test.ts here and
 * backend/tests/test_work_days.py) — change one, change both.
 *
 * Semantics (ADR 0059 §2): the finish date is INCLUSIVE. If the start
 * falls on a weekend it slides to the next Monday; that first working day
 * counts as day 1, so the result is the n-th working day on or after the
 * start. A 3-day task starting Friday finishes Tuesday.
 *
 * All math is UTC day-bucketed, matching dueStatus.ts and timeline/layout.ts.
 */

const DAY_MS = 86_400_000;

function isWeekendMs(ms: number): boolean {
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday … 6 = Saturday
  return dow === 0 || dow === 6;
}

function utcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC-midnight ms of the `workDays`-th Mon-Fri working day, counting the
 *  start day (slid to Monday if it falls on a weekend) as day 1.
 *  `workDays` must be >= 1 — the wire contract's domain. */
export function addWorkingDaysMs(startMs: number, workDays: number): number {
  let current = utcMidnight(startMs);
  while (isWeekendMs(current)) current += DAY_MS;
  for (let i = 1; i < workDays; i += 1) {
    current += DAY_MS;
    while (isWeekendMs(current)) current += DAY_MS;
  }
  return current;
}

/** Date-object convenience over `addWorkingDaysMs`. */
export function addWorkingDays(start: Date, workDays: number): Date {
  return new Date(addWorkingDaysMs(start.getTime(), workDays));
}

/** Inclusive count of Mon-Fri days in [start, end]; 0 when end < start or
 *  the span contains no weekday (e.g. Saturday -> Sunday). The inverse of
 *  addWorkingDays: countWorkingDays(s, addWorkingDays(s, n)) === n for
 *  every s and n >= 1. */
export function countWorkingDaysMs(startMs: number, endMs: number): number {
  let current = utcMidnight(startMs);
  const end = utcMidnight(endMs);
  let count = 0;
  while (current <= end) {
    if (!isWeekendMs(current)) count += 1;
    current += DAY_MS;
  }
  return count;
}

/** Date-object convenience over `countWorkingDaysMs`. */
export function countWorkingDays(start: Date, end: Date): number {
  return countWorkingDaysMs(start.getTime(), end.getTime());
}
