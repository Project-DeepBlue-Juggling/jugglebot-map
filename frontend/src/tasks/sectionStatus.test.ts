import { describe, expect, it } from 'vitest';
import type { Task, TaskStatus } from '../api/schemas';
import {
  buildChildSegmentIndex,
  buildEffectiveStatusIndex,
  effectiveStatusOf,
  rollUpStatus,
} from './sectionStatus';

const NOW = '2026-06-16T00:00:00Z';
const DEV_ID = '00000000-0000-0000-0000-000000000001';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    project_id: '00000000-0000-0000-0000-0000000000aa',
    parent_id: null,
    title: 'Task',
    description: '',
    completion_criteria: '',
    assignee_ids: [],
    stage: 'prototype',
    status: 'not_started',
    priority: null,
    is_section: false,
    backlog_rank: 0,
    color: null,
    canvas_x: 0,
    canvas_y: 0,
    canvas_collapsed: false,
    work_days: null,
    start_date: null,
    due_date: null,
    reviewer_id: null,
    effective_start_date: '2026-06-16',
    created_at: NOW,
    created_by: DEV_ID,
    updated_at: NOW,
    updated_by: DEV_ID,
    ...overrides,
  };
}

const section = (id: string, parent: string | null = null): Task =>
  makeTask({ id, parent_id: parent, is_section: true, title: `Section ${id}` });
const leaf = (id: string, status: TaskStatus, parent: string | null = null): Task =>
  makeTask({ id, parent_id: parent, status });

describe('rollUpStatus — the ADR 0048 truth table (progress-aware, blocked hidden)', () => {
  it('an empty section is not_started', () => {
    expect(rollUpStatus([])).toBe('not_started');
  });

  it('all children complete → complete', () => {
    expect(rollUpStatus(['complete', 'complete', 'complete'])).toBe('complete');
  });

  it('all children not_started → not_started', () => {
    expect(rollUpStatus(['not_started', 'not_started'])).toBe('not_started');
  });

  it('a mix of complete and not_started → in_progress (work has started overall)', () => {
    expect(rollUpStatus(['complete', 'not_started'])).toBe('in_progress');
  });

  it('any in_progress → in_progress', () => {
    expect(rollUpStatus(['not_started', 'in_progress'])).toBe('in_progress');
  });

  it('a blocked child is hidden — counts as in_progress, never surfaces as blocked', () => {
    expect(rollUpStatus(['in_progress', 'blocked'])).toBe('in_progress');
    expect(rollUpStatus(['complete', 'complete', 'blocked'])).toBe('in_progress');
  });

  it('a lone blocked child → in_progress (not blocked, not complete)', () => {
    expect(rollUpStatus(['blocked'])).toBe('in_progress');
  });

  it('blocked + not_started → in_progress (the blocked one counts as started)', () => {
    expect(rollUpStatus(['blocked', 'not_started'])).toBe('in_progress');
  });
});

describe('rollUpStatus — ADR 0052 backlog & qa', () => {
  it('all children backlog → backlog', () => {
    expect(rollUpStatus(['backlog', 'backlog'])).toBe('backlog');
  });

  it('a mix of backlog and not_started → not_started (both are not-yet-started)', () => {
    expect(rollUpStatus(['backlog', 'not_started'])).toBe('not_started');
  });

  it('backlog + in_progress → in_progress (work has started overall)', () => {
    expect(rollUpStatus(['backlog', 'in_progress'])).toBe('in_progress');
  });

  it('a qa child is hidden — counts as in_progress, never surfaces as qa', () => {
    expect(rollUpStatus(['qa'])).toBe('in_progress');
    expect(rollUpStatus(['complete', 'qa'])).toBe('in_progress');
  });

  it('backlog never overrides complete (mix → in_progress, not complete)', () => {
    expect(rollUpStatus(['complete', 'backlog'])).toBe('in_progress');
  });
});

describe('rollUpStatus — ADR 0075 dropped', () => {
  it('a dropped child leaves the count entirely — the rest decide', () => {
    // Without the filter this would be a mix and read in_progress. The whole
    // point of ADR 0075 §8 is that abandoning work you will never do makes the
    // figure above it MORE honest, so the section reads complete.
    expect(rollUpStatus(['complete', 'dropped'])).toBe('complete');
    expect(rollUpStatus(['complete', 'complete', 'dropped'])).toBe('complete');
  });

  it('a dropped child does not hold a section back from backlog or not_started', () => {
    expect(rollUpStatus(['backlog', 'dropped'])).toBe('backlog');
    expect(rollUpStatus(['not_started', 'dropped'])).toBe('not_started');
  });

  it('every child dropped → dropped (not the empty-section not_started)', () => {
    // The case that has to be stated separately: filtering first leaves an
    // empty list, and an empty list already means "a section with no children".
    expect(rollUpStatus(['dropped'])).toBe('dropped');
    expect(rollUpStatus(['dropped', 'dropped', 'dropped'])).toBe('dropped');
  });

  it('a section with no children at all is still not_started, not dropped', () => {
    expect(rollUpStatus([])).toBe('not_started');
  });

  it('dropped is discarded, not normalised — it never turns into in_progress', () => {
    // blocked/qa normalise to in_progress (ADR 0052); dropped must not, or a
    // fully-abandoned branch would read as work in flight.
    expect(rollUpStatus(['dropped', 'dropped'])).not.toBe('in_progress');
    expect(rollUpStatus(['complete', 'dropped'])).not.toBe('in_progress');
  });

  it('rolls up through a real tree: a section whose only open child was dropped', () => {
    const tasks = [section('s1'), leaf('t1', 'complete', 's1'), leaf('t2', 'dropped', 's1')];
    const idx = buildEffectiveStatusIndex(tasks);
    expect(idx.get('s1')).toBe('complete');
  });

  it('a section whose every child was dropped reads dropped, recursively', () => {
    const tasks = [
      section('s1'),
      section('s2', 's1'),
      leaf('t1', 'dropped', 's2'),
      leaf('t2', 'dropped', 's2'),
    ];
    const idx = buildEffectiveStatusIndex(tasks);
    expect(idx.get('s2')).toBe('dropped');
    // s1's only child is s2, which rolled up to dropped — so s1 is dropped too.
    expect(idx.get('s1')).toBe('dropped');
  });
});

describe('buildEffectiveStatusIndex', () => {
  it('a real task resolves to its own stored status', () => {
    const tasks = [leaf('t1', 'blocked'), leaf('t2', 'complete')];
    const idx = buildEffectiveStatusIndex(tasks);
    // A non-section task is never "hidden" — its own blocked status stands.
    expect(idx.get('t1')).toBe('blocked');
    expect(idx.get('t2')).toBe('complete');
  });

  it('a section rolls up its direct children', () => {
    const tasks = [section('s'), leaf('a', 'complete', 's'), leaf('b', 'in_progress', 's')];
    expect(buildEffectiveStatusIndex(tasks).get('s')).toBe('in_progress');
  });

  it('an all-complete section is complete (and would desaturate like a done task)', () => {
    const tasks = [section('s'), leaf('a', 'complete', 's'), leaf('b', 'complete', 's')];
    expect(buildEffectiveStatusIndex(tasks).get('s')).toBe('complete');
  });

  it('an empty section is not_started', () => {
    expect(buildEffectiveStatusIndex([section('s')]).get('s')).toBe('not_started');
  });

  it('a blocked leaf does NOT make its parent section blocked', () => {
    const tasks = [section('s'), leaf('a', 'blocked', 's'), leaf('b', 'complete', 's')];
    expect(buildEffectiveStatusIndex(tasks).get('s')).toBe('in_progress');
  });

  it('rolls up recursively over nested sections (whole subtree)', () => {
    // root section 's' has a child section 'c' (whose two leaves are both
    // complete → c is complete) plus a not_started leaf. So s sees
    // [complete (from c), not_started] → in_progress.
    const tasks = [
      section('s'),
      section('c', 's'),
      leaf('c1', 'complete', 'c'),
      leaf('c2', 'complete', 'c'),
      leaf('d', 'not_started', 's'),
    ];
    const idx = buildEffectiveStatusIndex(tasks);
    expect(idx.get('c')).toBe('complete');
    expect(idx.get('s')).toBe('in_progress');
  });

  it('a section of sections, all complete, is complete (recursion all the way down)', () => {
    const tasks = [section('root'), section('mid', 'root'), leaf('leaf', 'complete', 'mid')];
    const idx = buildEffectiveStatusIndex(tasks);
    expect(idx.get('mid')).toBe('complete');
    expect(idx.get('root')).toBe('complete');
  });

  it('effectiveStatusOf returns the rolled-up value for sections, own status otherwise', () => {
    const s = section('s');
    const a = leaf('a', 'in_progress', 's');
    const idx = buildEffectiveStatusIndex([s, a]);
    expect(effectiveStatusOf(s, idx)).toBe('in_progress');
    expect(effectiveStatusOf(a, idx)).toBe('in_progress');
  });
});

describe('buildChildSegmentIndex', () => {
  it("lists a section's direct children with their effective statuses", () => {
    const tasks = [section('s'), leaf('a', 'complete', 's'), leaf('b', 'blocked', 's')];
    const idx = buildEffectiveStatusIndex(tasks);
    const segs = buildChildSegmentIndex(tasks, idx).get('s');
    expect(segs?.map((x) => [x.id, x.status])).toEqual([
      ['a', 'complete'],
      ['b', 'blocked'],
    ]);
  });

  it('gives a sub-section ONE segment carrying its rolled-up status', () => {
    const tasks = [
      section('s'),
      section('c', 's'),
      leaf('c1', 'complete', 'c'),
      leaf('c2', 'complete', 'c'),
      leaf('d', 'not_started', 's'),
    ];
    const idx = buildEffectiveStatusIndex(tasks);
    const segs = buildChildSegmentIndex(tasks, idx).get('s');
    // Two segments for section 's': the sub-section 'c' (rolled up to complete)
    // and the leaf 'd' (not_started) — depth is collapsed to one-per-child.
    expect(segs?.map((x) => [x.id, x.status])).toEqual([
      ['c', 'complete'],
      ['d', 'not_started'],
    ]);
  });

  it('omits parents with no children', () => {
    expect(
      buildChildSegmentIndex([section('s')], buildEffectiveStatusIndex([section('s')])).has('s'),
    ).toBe(false);
  });
});
