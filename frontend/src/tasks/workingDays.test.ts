import { describe, expect, it } from 'vitest';
import { addWorkingDays, countWorkingDays } from './workingDays';

/**
 * Canonical working-day vectors (ADR 0059 §2) — mirrored VERBATIM from
 * backend/tests/test_work_days.py so the frontend preview math and the
 * backend truth can never drift silently. Change one, change both.
 */
const CANONICAL_VECTORS: Array<{ start: string; workDays: number; expected: string }> = [
  { start: '2026-07-17', workDays: 1, expected: '2026-07-17' }, // Fri, 1 day -> same Friday
  { start: '2026-07-17', workDays: 3, expected: '2026-07-21' }, // Fri, 3 days -> Tuesday
  { start: '2026-07-18', workDays: 1, expected: '2026-07-20' }, // Sat slides to Monday
  { start: '2026-07-13', workDays: 5, expected: '2026-07-17' }, // Mon, 5 days -> Friday
  { start: '2026-07-15', workDays: 7, expected: '2026-07-23' }, // Wed, 7 days -> next Thursday
];

function utc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

describe('workingDays (ADR 0059 shared vectors)', () => {
  it('guards the fixtures: the commented weekdays are real', () => {
    expect(utc('2026-07-17').getUTCDay()).toBe(5); // Friday
    expect(utc('2026-07-18').getUTCDay()).toBe(6); // Saturday
    expect(utc('2026-07-13').getUTCDay()).toBe(1); // Monday
    expect(utc('2026-07-15').getUTCDay()).toBe(3); // Wednesday
  });

  it.each(CANONICAL_VECTORS)(
    'addWorkingDays($start, $workDays) === $expected',
    ({ start, workDays, expected }) => {
      expect(addWorkingDays(utc(start), workDays).toISOString().slice(0, 10)).toBe(expected);
    },
  );

  it.each(CANONICAL_VECTORS)(
    'countWorkingDays is the inverse for ($start, $workDays)',
    ({ start, workDays, expected }) => {
      expect(countWorkingDays(utc(start), utc(expected))).toBe(workDays);
    },
  );

  it('counts 0 for an all-weekend or inverted span', () => {
    expect(countWorkingDays(utc('2026-07-18'), utc('2026-07-19'))).toBe(0); // Sat -> Sun
    expect(countWorkingDays(utc('2026-07-17'), utc('2026-07-13'))).toBe(0); // inverted
  });

  it('counts a full working week inclusively', () => {
    expect(countWorkingDays(utc('2026-07-13'), utc('2026-07-17'))).toBe(5);
  });
});
