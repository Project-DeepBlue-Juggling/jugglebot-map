import { describe, expect, it } from 'vitest';
import type { Task } from '../api/schemas';
import { mapTask } from '../test/mapFixtures';
import { isWallSort, wallComparator, type WallSort } from './wallSort';

const items: Task[] = [
  mapTask({ id: 'i-old', kind: 'idea', priority: 'high', created_at: '2026-10-01T00:00:00Z' }),
  mapTask({ id: 'f-new', kind: 'feature', priority: null, created_at: '2026-10-27T09:00:00Z' }),
  mapTask({ id: 'b-mid', kind: 'bug', priority: 'low', created_at: '2026-10-15T00:00:00Z' }),
  mapTask({ id: 'b-new', kind: 'bug', priority: 'medium', created_at: '2026-10-27T09:00:00Z' }),
  mapTask({ id: 'i-mid', kind: 'idea', priority: 'medium', created_at: '2026-10-15T00:00:00Z' }),
];

function order(sort: WallSort, tasks: readonly Task[] = items): string[] {
  return [...tasks].sort(wallComparator(sort)).map((t) => t.id);
}

describe('wallComparator', () => {
  it('type: bug, feature, idea, newest first within a kind', () => {
    expect(order('type')).toEqual(['b-new', 'b-mid', 'f-new', 'i-mid', 'i-old']);
  });

  it('age: newest filed first, ties by id', () => {
    expect(order('age')).toEqual(['b-new', 'f-new', 'b-mid', 'i-mid', 'i-old']);
  });

  it('severity: high, medium, low, none, newest first within a priority', () => {
    expect(order('severity')).toEqual(['i-old', 'b-new', 'i-mid', 'b-mid', 'f-new']);
  });

  it('does not depend on the input order', () => {
    const reversed = [...items].reverse();
    for (const s of ['type', 'age', 'severity'] as const) {
      expect(order(s, reversed)).toEqual(order(s));
    }
  });

  it('sorts an unparseable filing date as the oldest', () => {
    const bad = mapTask({ id: 'x', kind: 'bug', created_at: 'garbage' });
    expect(order('age', [bad, ...items]).at(-1)).toBe('x');
  });
});

describe('isWallSort', () => {
  it('accepts the three orders and nothing else', () => {
    expect(['type', 'age', 'severity'].every(isWallSort)).toBe(true);
    expect(isWallSort('priority')).toBe(false);
    expect(isWallSort(null)).toBe(false);
  });
});
