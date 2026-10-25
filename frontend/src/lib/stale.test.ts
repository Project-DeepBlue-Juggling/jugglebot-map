import { describe, expect, it } from 'vitest';
import { mapTask } from '../test/mapFixtures';
import { isStale, staleAge, staleClock } from './stale';

// The shared fixture: the Python side encodes the same ten rows.
const TODAY = new Date(2026, 9, 25, 12);

function row(status: string, created: string, progress: string[], updated: string) {
  const body =
    progress.length === 0
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
});
