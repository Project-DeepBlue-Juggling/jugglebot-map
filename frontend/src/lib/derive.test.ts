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
  phaseSummary,
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

describe('P4 audit fixes (derive)', () => {
  it('A1: a superseded or parked plan is one unit, not its phases', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('old', 'pw', ['complete', 'not_started'], { status: 'superseded' }),
      ...planWithPhases('later', 'pw', ['not_started', 'not_started'], { status: 'parked' }),
    ];
    const ix = buildIndex(tasks, []);
    const pr = progress(ix, get(ix, 'pw'));
    expect(ids(pr.units.map((u) => u.task)).sort()).toEqual(['later', 'old']);
    expect(pr.done).toBe(1);
    expect(ids(pr.remaining.map((u) => u.task))).toEqual(['later']);
    const only = buildIndex(
      [
        mapTask({ id: 'pw' }),
        ...planWithPhases('old', 'pw', ['not_started'], { status: 'superseded' }),
      ],
      [],
    );
    const p2 = progress(only, get(only, 'pw'));
    expect([p2.total, p2.done, p2.remaining.length]).toEqual([1, 1, 0]);
  });

  it('A2: an in-progress computed Next stays in Now and the Next lane is empty', () => {
    const ix = buildIndex(
      [
        mapTask({ id: 'pw' }),
        ...planWithPhases('p', 'pw', ['complete', 'in_progress', 'not_started']),
      ],
      [],
    );
    const l = lanes(ix, get(ix, 'pw'));
    expect(nextStop(ix, get(ix, 'pw'))?.id).toBe('p#P2');
    expect(ids(l.now)).toEqual(['p#P2']);
    expect(l.next).toEqual([]);
  });

  it('A3: when every unfinished phase of a ready plan waits, Next is the first blocker', () => {
    const ix = buildIndex(
      [
        mapTask({ id: 'pw' }),
        ...planWithPhases('p', 'pw', ['complete', 'not_started']),
        mapTask({ id: 'tk', kind: 'ticket', status: 'open', parent_id: 'pw', pathway_id: 'pw' }),
      ],
      [dep('tk', 'p#P2')],
    );
    expect(nextStop(ix, get(ix, 'pw'))?.id).toBe('tk');
  });

  it('V3: phaseSummary prefers Approach, strips label and markdown, clips to 240', () => {
    const body = [
      '**Implements:** the `derive.ts` pass.',
      '**Files:** `a.ts`, `b.ts`',
      '**Approach:** Compute the __lanes__ from **plan** order using `openBlockers`.',
      '**Tests:** vitest.',
    ].join('\n\n');
    const t = mapTask({ id: 'x', kind: 'phase', description: body });
    expect(phaseSummary(t)).toBe('Compute the lanes from plan order using openBlockers.');
    const first = mapTask({
      id: 'y',
      kind: 'phase',
      description: '**Implements:** the `derive.ts` pass.\n\nmore',
    });
    expect(phaseSummary(first)).toBe('the derive.ts pass.');
    const long = mapTask({ id: 'z', kind: 'phase', description: 'w'.repeat(500) });
    expect(phaseSummary(long)).toHaveLength(240);
    expect(phaseSummary(mapTask({ id: 'e', kind: 'phase' }))).toBe('');
  });
});
