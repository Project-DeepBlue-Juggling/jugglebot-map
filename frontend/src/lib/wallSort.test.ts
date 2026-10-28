import { describe, expect, it } from 'vitest';
import type { Task } from '../api/schemas';
import { mapTask } from '../test/mapFixtures';
import { effortRank, isBreakSized } from './metrics';
import {
  chooseWallSort,
  DEFAULT_WALL_ORDER,
  isWallSort,
  parseWallOrder,
  serializeWallOrder,
  matchesWallFilter,
  NO_WALL_FILTER,
  wallComparator,
  type WallSort,
} from './wallSort';

const items: Task[] = [
  mapTask({ id: 'i-old', kind: 'idea', priority: 'high', created_at: '2026-10-01T00:00:00Z' }),
  mapTask({ id: 'f-new', kind: 'feature', priority: null, created_at: '2026-10-27T09:00:00Z' }),
  mapTask({ id: 'b-mid', kind: 'bug', priority: 'low', created_at: '2026-10-15T00:00:00Z' }),
  mapTask({ id: 'b-new', kind: 'bug', priority: 'medium', created_at: '2026-10-27T09:00:00Z' }),
  mapTask({ id: 'i-mid', kind: 'idea', priority: 'medium', created_at: '2026-10-15T00:00:00Z' }),
];

function order(sort: WallSort, tasks: readonly Task[] = items, reversed = false): string[] {
  return [...tasks].sort(wallComparator(sort, reversed)).map((t) => t.id);
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
  it('accepts the four orders and nothing else', () => {
    expect(['type', 'age', 'severity', 'effort'].every(isWallSort)).toBe(true);
    expect(isWallSort('priority')).toBe(false);
    expect(isWallSort(null)).toBe(false);
  });
});

describe('effort sort and the metric filters', () => {
  const rated = [
    mapTask({ id: 'u', kind: 'idea', created_at: '2026-10-27T00:00:00Z' }),
    mapTask({ id: 'm', kind: 'idea', effort: 'm', created_at: '2026-10-01T00:00:00Z' }),
    mapTask({ id: 'xs-old', kind: 'idea', effort: 'xs', created_at: '2026-10-01T00:00:00Z' }),
    mapTask({ id: 'xs-new', kind: 'idea', effort: 'xs', created_at: '2026-10-20T00:00:00Z' }),
    mapTask({ id: 'xl', kind: 'idea', effort: 'xl', created_at: '2026-10-28T00:00:00Z' }),
  ];

  it('effort: xs first, unrated last, newest first within an effort', () => {
    expect(order('effort', rated)).toEqual(['xs-new', 'xs-old', 'm', 'xl', 'u']);
    expect(effortRank(null)).toBeGreaterThan(effortRank('xl'));
  });

  const free = { hardware: 'none', owner: 'none' } as const;

  it('break-sized: effort <= s, hardware none, owner none', () => {
    expect(isBreakSized(mapTask({ id: 'a', kind: 'idea', effort: 's', ...free }))).toBe(true);
    expect(isBreakSized(mapTask({ id: 'a', kind: 'idea', effort: 'm', ...free }))).toBe(false);
    expect(
      isBreakSized(mapTask({ id: 'a', kind: 'idea', effort: 'xs', ...free, hardware: 'robot' })),
    ).toBe(false);
    expect(
      isBreakSized(mapTask({ id: 'a', kind: 'idea', effort: 'xs', ...free, owner: 'hands' })),
    ).toBe(false);
    // Unrated never qualifies.
    expect(isBreakSized(mapTask({ id: 'a', kind: 'idea', effort: 'xs' }))).toBe(false);
  });

  it('break-sized: a bug also needs a confirmed diagnosis', () => {
    const bug = { id: 'b', kind: 'bug', effort: 'xs', ...free } as const;
    expect(isBreakSized(mapTask({ ...bug, diagnosis: 'hypothesis' }))).toBe(false);
    expect(isBreakSized(mapTask({ ...bug, diagnosis: null }))).toBe(false);
    expect(isBreakSized(mapTask({ ...bug, diagnosis: 'confirmed' }))).toBe(true);
  });

  it('the area filter keeps one area; null keeps all', () => {
    const t = mapTask({ id: 'g', kind: 'idea', area: 'gui' });
    expect(matchesWallFilter(t, { ...NO_WALL_FILTER, area: 'gui' })).toBe(true);
    expect(matchesWallFilter(t, { ...NO_WALL_FILTER, area: 'docs' })).toBe(false);
    expect(matchesWallFilter(t, NO_WALL_FILTER)).toBe(true);
  });
});

describe('reversed orders', () => {
  it('age: oldest filed first', () => {
    expect(order('age', items, true)).toEqual(['i-old', 'b-mid', 'i-mid', 'b-new', 'f-new']);
  });

  it('type: idea, feature, bug, newest first within a kind', () => {
    expect(order('type', items, true)).toEqual(['i-mid', 'i-old', 'f-new', 'b-new', 'b-mid']);
  });

  it('severity: low first, unrated still last', () => {
    expect(order('severity', items, true)).toEqual(['b-mid', 'b-new', 'i-mid', 'i-old', 'f-new']);
  });

  it('effort: xl first, unrated still last under both directions', () => {
    const rated = [
      mapTask({ id: 'u', kind: 'idea', created_at: '2026-10-27T00:00:00Z' }),
      mapTask({ id: 'xs', kind: 'idea', effort: 'xs', created_at: '2026-10-01T00:00:00Z' }),
      mapTask({ id: 'xl', kind: 'idea', effort: 'xl', created_at: '2026-10-28T00:00:00Z' }),
    ];
    expect(order('effort', rated)).toEqual(['xs', 'xl', 'u']);
    expect(order('effort', rated, true)).toEqual(['xl', 'xs', 'u']);
  });
});

describe('wall order choice and persistence', () => {
  it('choosing the active sort flips it; another sort starts un-reversed', () => {
    const a = chooseWallSort({ sort: 'age', reversed: false }, 'age');
    expect(a).toEqual({ sort: 'age', reversed: true });
    expect(chooseWallSort(a, 'age')).toEqual({ sort: 'age', reversed: false });
    expect(chooseWallSort(a, 'type')).toEqual({ sort: 'type', reversed: false });
  });

  it('round-trips, migrates a bare key and falls back on junk', () => {
    const o = { sort: 'effort', reversed: true } as const;
    expect(parseWallOrder(serializeWallOrder(o))).toEqual(o);
    expect(serializeWallOrder(o)).toBe('{"sort":"effort","reversed":true}');
    expect(parseWallOrder('type')).toEqual({ sort: 'type', reversed: false });
    expect(parseWallOrder('bogus')).toEqual(DEFAULT_WALL_ORDER);
    expect(parseWallOrder('{"sort":"nope"}')).toEqual(DEFAULT_WALL_ORDER);
    expect(parseWallOrder(null)).toEqual(DEFAULT_WALL_ORDER);
  });
});
