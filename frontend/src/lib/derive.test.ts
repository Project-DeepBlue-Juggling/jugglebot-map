import { describe, expect, it } from 'vitest';
import type { Task } from '../api/schemas';
import { dep, mapTask, planWithPhases } from '../test/mapFixtures';
import {
  buildIndex,
  formatAge,
  lanes,
  nextStop,
  openBlockers,
  orderPathways,
  progress,
  progressUnits,
  taskState,
  wallItems,
  type MapIndex,
} from './derive';

const ids = (ts: { id: string }[]) => ts.map((t) => t.id);

function get(ix: MapIndex, id: string): Task {
  const t = ix.byId.get(id);
  if (t === undefined) throw new Error(`no task ${id}`);
  return t;
}

describe('orderPathways', () => {
  it('orders by priority, then status, then title', () => {
    const tasks = [
      mapTask({ id: 'low', priority: 'low' }),
      mapTask({ id: 'none', priority: null }),
      mapTask({ id: 'hi-b', title: 'B', priority: 'high' }),
      mapTask({ id: 'hi-a', title: 'A', priority: 'high' }),
      mapTask({ id: 'hi-done', title: '0', priority: 'high', status: 'complete' }),
      mapTask({ id: 'med', priority: 'medium' }),
      mapTask({ id: 'plan', kind: 'plan' }),
    ];
    expect(ids(orderPathways(tasks))).toEqual(['hi-a', 'hi-b', 'hi-done', 'med', 'low', 'none']);
  });
});

describe('progress units', () => {
  it('counts phases, or the plan itself, and excludes dropped / retired', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['complete', 'retired', 'in_progress', 'not_started']),
      mapTask({ id: 'solo', kind: 'plan', status: 'active', parent_id: 'pw', pathway_id: 'pw' }),
      mapTask({ id: 'gone', kind: 'plan', status: 'dropped', parent_id: 'pw', pathway_id: 'pw' }),
    ];
    const ix = buildIndex(tasks, []);
    const pw = get(ix, 'pw');
    expect(ids(progressUnits(ix, pw).map((u) => u.task))).toEqual([
      'a#P1',
      'a#P2',
      'a#P3',
      'a#P4',
      'solo',
      'gone',
    ]);
    const p = progress(ix, pw);
    expect(p.total).toBe(4);
    expect(p.done).toBe(1);
    expect(p.excluded).toBe(2);
    expect(ids(p.remaining.map((u) => u.task))).toEqual(['a#P3', 'a#P4', 'solo']);
  });
});

describe('nextStop', () => {
  it('is the first unfinished phase of the first plan', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['complete', 'not_started']),
    ];
    const ix = buildIndex(tasks, []);
    expect(nextStop(ix, get(ix, 'pw'))?.id).toBe('a#P2');
  });

  it('skips a plan with an open blocker and a blocked phase', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['not_started']),
      ...planWithPhases('b', 'pw', ['not_started', 'not_started']),
      mapTask({ id: 'feat', kind: 'feature', status: 'backlog' }),
    ];
    const ix = buildIndex(tasks, [dep('feat', 'a'), dep('feat', 'b#P1')]);
    expect(nextStop(ix, get(ix, 'pw'))?.id).toBe('b#P2');
  });

  it('ignores a done blocker', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['not_started']),
      mapTask({ id: 'feat', kind: 'feature', status: 'complete' }),
    ];
    const ix = buildIndex(tasks, [dep('feat', 'a')]);
    expect(openBlockers(ix, 'a')).toEqual([]);
    expect(nextStop(ix, get(ix, 'pw'))?.id).toBe('a#P1');
  });

  it('is the blocker when every open plan waits on one', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['not_started']),
      ...planWithPhases('b', 'pw', ['not_started']),
      mapTask({ id: 'probe', kind: 'feature', status: 'backlog' }),
      mapTask({ id: 'other', kind: 'bug', status: 'inbox' }),
    ];
    const ix = buildIndex(tasks, [dep('probe', 'a'), dep('other', 'b')]);
    expect(nextStop(ix, get(ix, 'pw'))?.id).toBe('probe');
    expect(ids(lanes(ix, get(ix, 'pw')).next)).toEqual(['probe']);
  });

  it('is null for a pathway with no plans, and skips parked plans', () => {
    const tasks = [
      mapTask({ id: 'empty' }),
      mapTask({ id: 'pw' }),
      mapTask({ id: 'pk', kind: 'plan', status: 'parked', parent_id: 'pw', pathway_id: 'pw' }),
    ];
    const ix = buildIndex(tasks, []);
    expect(nextStop(ix, get(ix, 'empty'))).toBeNull();
    expect(nextStop(ix, get(ix, 'pw'))).toBeNull();
    expect(lanes(ix, get(ix, 'empty'))).toEqual({ now: [], next: [], later: [], done: [] });
  });
});

describe('lanes', () => {
  it('sorts phases, plans, tickets and attached items into Now / Next / Later / Done', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['complete', 'in_progress', 'not_started', 'not_started']),
      mapTask({ id: 'pk', kind: 'plan', status: 'parked', parent_id: 'pw', pathway_id: 'pw' }),
      mapTask({ id: 'old', kind: 'plan', status: 'superseded', parent_id: 'pw', pathway_id: 'pw' }),
      mapTask({
        id: 'claimed',
        kind: 'ticket',
        status: 'open',
        assignee_ids: ['u1'],
        pathway_id: 'pw',
      }),
      mapTask({ id: 'free', kind: 'ticket', status: 'open', pathway_id: 'pw' }),
      mapTask({ id: 'bug', kind: 'bug', status: 'in_progress', pathway_id: 'pw' }),
      mapTask({ id: 'promo', kind: 'idea', status: 'promoted', pathway_id: 'pw' }),
    ];
    const ix = buildIndex(tasks, []);
    const l = lanes(ix, get(ix, 'pw'));
    // In-progress P2 is unfinished, so it is also the computed Next; Now wins.
    expect(ids(l.now)).toEqual(['a#P2', 'claimed']);
    expect(ids(l.next)).toEqual([]);
    expect(ids(l.later)).toEqual(['a#P3', 'a#P4', 'pk', 'free', 'bug']);
    expect(ids(l.done)).toEqual(['a#P1', 'old', 'promo']);
    expect(taskState(get(ix, 'claimed'))).toBe('in_progress');
  });

  it('puts the computed Next in Next when nothing is in progress', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['complete', 'not_started']),
    ];
    const ix = buildIndex(tasks, []);
    expect(ids(lanes(ix, get(ix, 'pw')).next)).toEqual(['a#P2']);
  });
});

describe('wallItems and formatAge', () => {
  it('lists every open inbox-kind item, attached or not, by priority', () => {
    const tasks = [
      mapTask({ id: 'i1', kind: 'idea', status: 'inbox' }),
      mapTask({ id: 'b1', kind: 'bug', status: 'backlog', priority: 'high', pathway_id: 'pw' }),
      mapTask({ id: 'f1', kind: 'feature', status: 'promoted' }),
      mapTask({ id: 't1', kind: 'ticket', status: 'open' }),
    ];
    expect(ids(wallItems(buildIndex(tasks, [])))).toEqual(['b1', 'i1']);
  });

  it('formats ages', () => {
    const now = new Date('2026-05-13T12:00:00Z');
    expect(formatAge('2026-05-13T01:00:00Z', now)).toBe('today');
    expect(formatAge('2026-05-10T12:00:00Z', now)).toBe('3d');
    expect(formatAge('2026-04-22T12:00:00Z', now)).toBe('3w');
    expect(formatAge('2026-01-13T12:00:00Z', now)).toBe('4mo');
    expect(formatAge('garbage', now)).toBe('');
  });
});
