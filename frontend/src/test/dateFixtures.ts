// Frozen-test-clock fixtures and helpers (ADR 0033).
//
// All frontend unit tests run with `new Date()` and `Date.now()` pinned to
// SENTINEL via `vi.setSystemTime` in `setupTests.ts`. Tests can therefore use
// absolute ISO dates relative to SENTINEL ("today is 2026-05-13; a due_date
// of 2026-05-20 is 7 days out, exactly at the default warning window").
//
// For "N days from today" patterns where the relative offset is the
// load-bearing detail, use `addDays(SENTINEL, N)` rather than inlining
// the millisecond arithmetic.

export const SENTINEL_ISO = '2026-05-13T12:00:00.000Z';
export const SENTINEL = new Date(SENTINEL_ISO);

const DAY_MS = 86_400_000;

/** Returns a new Date offset from `base` by `days` (may be negative). */
export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/** ISO 8601 instant offset from SENTINEL by `days`. */
export function sentinelPlusDays(days: number): string {
  return addDays(SENTINEL, days).toISOString();
}

/** YYYY-MM-DD calendar day offset from SENTINEL by `days`. */
export function sentinelPlusDaysAsDay(days: number): string {
  return addDays(SENTINEL, days).toISOString().slice(0, 10);
}
