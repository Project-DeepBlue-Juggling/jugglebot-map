import { describe, expect, it } from 'vitest';
import { mapTask } from '../test/mapFixtures';
import { isStale, staleAge, staleClock } from './stale';

// The shared fixture: the Python side encodes the same fourteen rows.
const TODAY = new Date(2026, 9, 25, 12);

// `progress` is a list of dates (written under one "## Progress") or, for
// rows 11-14, the raw body text.
function row(status: string, created: string, progress: string[] | string, updated: string) {
  const body =
    typeof progress === 'string'
      ? progress
      : progress.length === 0
        ? ''
        : `## Progress\n\n${progress.map((d) => `${d} - note`).join('\n')}\n`;
  return mapTask({
    id: 'x',
    kind: 'feature',
    status,
    description: body,
    created_at: `${created}T00:00:00Z`,
    updated_at: `${updated}T00:00:00Z`,
  });
}

describe('staleness fixture', () => {
  it('row 1: inbox, 24 d, not stale', () => {
    const t = row('inbox', '2026-10-01', [], '2026-10-01');
    expect(staleAge(t, TODAY)).toBe(24);
    expect(isStale(t, TODAY)).toBe(false);
  });
  it('row 2: inbox, 35 d, stale', () => {
    expect(isStale(row('inbox', '2026-09-20', [], '2026-09-20'), TODAY)).toBe(true);
  });
  it('row 3: in_progress, progress 10 d ago, not stale', () => {
    expect(isStale(row('in_progress', '2026-09-01', ['2026-10-15'], '2026-10-15'), TODAY)).toBe(
      false,
    );
  });
  it('row 4: in_progress, newest progress 24 d ago, stale', () => {
    const t = row('in_progress', '2026-09-01', ['2026-09-10', '2026-10-01'], '2026-10-01');
    expect(staleClock(t)).toBe('2026-10-01');
    expect(isStale(t, TODAY)).toBe(true);
  });
  it('row 5: backlog, 66 d, stale', () => {
    expect(isStale(row('backlog', '2026-08-01', ['2026-08-20'], '2026-08-20'), TODAY)).toBe(true);
  });
  it('row 6: backlog, 56 d, not stale', () => {
    expect(isStale(row('backlog', '2026-08-30', [], '2026-08-30'), TODAY)).toBe(false);
  });
  it('row 7: complete is never stale', () => {
    expect(isStale(row('complete', '2026-01-01', [], '2026-01-01'), TODAY)).toBe(false);
  });
  it('row 8: updated older than progress is ignored, 5 d, not stale', () => {
    const t = row('inbox', '2026-09-01', ['2026-10-20'], '2026-09-02');
    expect(staleAge(t, TODAY)).toBe(5);
    expect(isStale(t, TODAY)).toBe(false);
  });
  it('row 9: a recent updated does not rescue a 54 d clock', () => {
    const t = row('inbox', '2026-09-01', [], '2026-10-24');
    expect(staleAge(t, TODAY)).toBe(54);
    expect(isStale(t, TODAY)).toBe(true);
  });
  it('row 10: exactly 30 d is not stale (strictly greater)', () => {
    const t = row('inbox', '2026-09-25', [], '2026-09-25');
    expect(staleAge(t, TODAY)).toBe(30);
    expect(isStale(t, TODAY)).toBe(false);
  });
  // Rows 11-14 pin the Progress parse rule shared with mapkit/items.py.
  it('row 11: a date with no separator is not a Progress line, 54 d from created, stale', () => {
    const t = row('inbox', '2026-09-01', '## Progress\n\n2026-10-20 filed again\n', '2026-09-01');
    expect(staleAge(t, TODAY)).toBe(54);
    expect(isStale(t, TODAY)).toBe(true);
  });
  it('row 12: a lower-case "## progress" heading counts, 5 d, not stale', () => {
    const t = row('inbox', '2026-09-01', '## progress\n\n2026-10-20: note\n', '2026-09-01');
    expect(staleAge(t, TODAY)).toBe(5);
    expect(isStale(t, TODAY)).toBe(false);
  });
  it('row 13: every Progress section counts, newest in the second, 5 d, not stale', () => {
    const t = row(
      'inbox',
      '2026-08-01',
      '## Progress\n\n2026-09-01: a\n\n## Notes\n\nx\n\n## Progress\n\n2026-10-20: b\n',
      '2026-08-01',
    );
    expect(staleAge(t, TODAY)).toBe(5);
    expect(isStale(t, TODAY)).toBe(false);
  });
  it('row 14: an impossible date newer than a valid one is skipped, 283 d, stale', () => {
    const t = row(
      'inbox',
      '2026-01-01',
      '## Progress\n\n2026-01-15: y\n2026-02-30: x\n',
      '2026-01-01',
    );
    expect(staleClock(t)).toBe('2026-01-15');
    expect(staleAge(t, TODAY)).toBe(283);
    expect(isStale(t, TODAY)).toBe(true);
  });
});
