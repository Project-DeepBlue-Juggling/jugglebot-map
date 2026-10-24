import { describe, expect, it } from 'vitest';
import { dateInputToIso, dueStatus, formatDueDate, isoToDateInput } from './dueStatus';
import type { Project, Task } from '../api/schemas';

/**
 * ADR 0026 §Indicator UI — classifier edge cases.
 *
 * `now` is a fixed reference instant; the day-bucket is `2026-05-13` UTC.
 * Every test below pins both inputs explicitly so the suite is deterministic
 * regardless of the host's timezone or wall clock.
 */

const NOW = new Date('2026-05-13T12:00:00Z');
const PROJECT: Pick<Project, 'due_date_warning_days'> = { due_date_warning_days: 7 };

function task(
  partial: Partial<Pick<Task, 'due_date' | 'status'>>,
): Pick<Task, 'due_date' | 'status'> {
  return { due_date: null, status: 'not_started', ...partial };
}

describe('dueStatus classifier (ADR 0026)', () => {
  it('returns `complete` for completed tasks regardless of date', () => {
    expect(
      dueStatus(task({ status: 'complete', due_date: '2026-01-01T00:00:00Z' }), PROJECT, NOW),
    ).toBe('complete');
    expect(
      dueStatus(task({ status: 'complete', due_date: '2099-01-01T00:00:00Z' }), PROJECT, NOW),
    ).toBe('complete');
    expect(dueStatus(task({ status: 'complete', due_date: null }), PROJECT, NOW)).toBe('complete');
  });

  it('returns `dropped` for abandoned tasks regardless of date (ADR 0075)', () => {
    // The point: a task nobody will ever do cannot be late. A long-past due
    // date on a dropped task must not light up the OVERDUE pill.
    expect(
      dueStatus(task({ status: 'dropped', due_date: '2026-01-01T00:00:00Z' }), PROJECT, NOW),
    ).toBe('dropped');
    expect(
      dueStatus(task({ status: 'dropped', due_date: '2026-05-14T00:00:00Z' }), PROJECT, NOW),
    ).toBe('dropped');
    expect(dueStatus(task({ status: 'dropped', due_date: null }), PROJECT, NOW)).toBe('dropped');
  });

  it('keeps `dropped` distinct from `complete` so no caller has to conflate them', () => {
    const overdueDate = '2026-01-01T00:00:00Z';
    expect(dueStatus(task({ status: 'dropped', due_date: overdueDate }), PROJECT, NOW)).not.toBe(
      'complete',
    );
    // Both suppress the indicators, which is what callers actually act on.
    expect(dueStatus(task({ status: 'dropped', due_date: overdueDate }), PROJECT, NOW)).not.toBe(
      'overdue',
    );
  });

  it('returns `no-date` for null due_date when not complete', () => {
    expect(dueStatus(task({ due_date: null }), PROJECT, NOW)).toBe('no-date');
  });

  it('returns `overdue` when due_date is strictly before today', () => {
    expect(dueStatus(task({ due_date: '2026-05-12T23:59:00Z' }), PROJECT, NOW)).toBe('overdue');
    expect(dueStatus(task({ due_date: '2026-01-01T00:00:00Z' }), PROJECT, NOW)).toBe('overdue');
  });

  it('returns `due-soon` when due_date is today (boundary case)', () => {
    // Same-day deadlines are "due soon", not "overdue" — the bar's last day
    // is still actionable.
    expect(dueStatus(task({ due_date: '2026-05-13T00:00:00Z' }), PROJECT, NOW)).toBe('due-soon');
  });

  it('returns `due-soon` when due_date is exactly warning_days away', () => {
    // 2026-05-13 + 7 days = 2026-05-20 — inclusive boundary.
    expect(dueStatus(task({ due_date: '2026-05-20T00:00:00Z' }), PROJECT, NOW)).toBe('due-soon');
  });

  it('returns `normal` when due_date is one day past the warning window', () => {
    expect(dueStatus(task({ due_date: '2026-05-21T00:00:00Z' }), PROJECT, NOW)).toBe('normal');
  });

  it('respects a custom project threshold', () => {
    const wider: Pick<Project, 'due_date_warning_days'> = { due_date_warning_days: 30 };
    // Same date that was `normal` at threshold 7 is `due-soon` at threshold 30.
    expect(dueStatus(task({ due_date: '2026-06-01T00:00:00Z' }), wider, NOW)).toBe('due-soon');
    // And a 60-day-out task is still `normal` at threshold 30.
    expect(dueStatus(task({ due_date: '2026-07-12T00:00:00Z' }), wider, NOW)).toBe('normal');
  });

  it('overdue overrides every status except `complete`', () => {
    // An in-progress, blocked, or not-started overdue task all read `overdue`;
    // only `complete` masks it (mirrors the "mutually exclusive" rule in the
    // ADR — the OVERDUE pill subsumes the warning icon).
    for (const status of ['not_started', 'in_progress', 'blocked'] as const) {
      expect(dueStatus(task({ status, due_date: '2026-01-01T00:00:00Z' }), PROJECT, NOW)).toBe(
        'overdue',
      );
    }
  });
});

describe('formatDueDate', () => {
  it('returns em-dash for null', () => {
    expect(formatDueDate(null)).toBe('—');
  });

  it('returns a date string for ISO inputs', () => {
    const out = formatDueDate('2026-06-15T00:00:00Z');
    // Locale-dependent shape, but it must contain the year and a recognisable
    // month. We assert on substrings rather than the exact format so the test
    // is stable across Node's ICU build variants.
    expect(out).toContain('2026');
    expect(out).toMatch(/Jun|06/);
  });
});

describe('dateInputToIso / isoToDateInput round-trip', () => {
  it('empty string round-trips to null', () => {
    expect(dateInputToIso('')).toBeNull();
    expect(isoToDateInput(null)).toBe('');
  });

  it('YYYY-MM-DD round-trips through UTC midnight', () => {
    const iso = dateInputToIso('2026-06-15');
    expect(iso).toBe('2026-06-15T00:00:00.000Z');
    expect(isoToDateInput(iso)).toBe('2026-06-15');
  });

  it('strips the time portion when converting back', () => {
    expect(isoToDateInput('2026-06-15T17:42:00Z')).toBe('2026-06-15');
  });
});
