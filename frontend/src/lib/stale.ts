import type { Task } from '../api/schemas';
import { progressDates } from './done';

/**
 * Staleness of open inbox-kind items: the one place the thresholds live on
 * this side (the server encodes the same rule; both are pinned by the shared
 * ten-row fixture). Pure: the caller passes `today`.
 */
export const STALE_DAYS: Readonly<Record<string, number>> = {
  inbox: 30,
  backlog: 60,
  in_progress: 14,
};

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of a Date in local time. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * Where an item's staleness clock starts (`YYYY-MM-DD`): the newest dated
 * `## Progress` line of its body, else `created`. `updated` is deliberately
 * ignored: every write bumps it (a no-op save, a status flip), so it measures
 * the last touch, not the last attention.
 */
export function staleClock(item: Task): string {
  const dates = progressDates(item.description ?? '');
  if (dates.length > 0) return dates.reduce((a, b) => (a >= b ? a : b));
  return item.created_at.slice(0, 10);
}

/** Days since the clock started (`today` is one `new Date()` taken at render). */
export function staleAge(item: Task, today: Date): number {
  return daysBetween(staleClock(item), ymd(today));
}

/** Stale when strictly older than its status's threshold; other statuses never are. */
export function isStale(item: Task, today: Date): boolean {
  const limit = STALE_DAYS[item.status];
  if (limit === undefined) return false;
  return staleAge(item, today) > limit;
}
