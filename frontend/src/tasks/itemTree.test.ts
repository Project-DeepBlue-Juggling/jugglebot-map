import { describe, expect, it } from 'vitest';
import type { Task } from '../api/schemas';
import { byTitle, flattenItemTree, lineageOf, type SiblingComparator } from './itemTree';

const NOW = '2026-06-04T00:00:00Z';
const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa';
const DEV_ID = '00000000-0000-0000-0000-000000000001';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    project_id: PROJECT_ID,
    parent_id: null,
    title: 'Task',
    description: '',
    completion_criteria: '',
    assignee_ids: [],
    kind: 'prototype',
    slug: 'task',
    destination: '',
    branch: null,
    links: [],
    filed_by: null,
    promoted_to: null,
    rank: null,
    ticket_type: null,
    source_path: 'map/task.md',
    editable: true,
    pathway_id: null,
    short_id: null,
    unpushed: false,
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
    effective_start_date: '2026-06-04',
    created_at: NOW,
    created_by: DEV_ID,
    updated_at: NOW,
    updated_by: DEV_ID,
    ...overrides,
  };
}

/** Compact assertion shape: `title@depth(±children)`. */
function shape(tasks: Task[], compare?: SiblingComparator): string[] {
  return flattenItemTree(tasks, compare).map(
    (r) => `${r.task.title}@${r.depth}${r.hasChildren ? '+' : '-'}`,
  );
}

describe('flattenItemTree', () => {
  it('returns an empty array for no tasks', () => {
    expect(flattenItemTree([])).toEqual([]);
  });

  it('places a child immediately after its parent and increments depth', () => {
    const parent = makeTask({ id: 'p', title: 'Parent' });
    const child = makeTask({ id: 'c', title: 'Child', parent_id: 'p' });
    expect(shape([child, parent])).toEqual(['Parent@0+', 'Child@1-']);
  });

  it('orders siblings by title by default (not input order)', () => {
    const root = makeTask({ id: 'r', title: 'Root' });
    const zeta = makeTask({ id: 'z', title: 'Zeta', parent_id: 'r' });
    const alpha = makeTask({ id: 'a', title: 'Alpha', parent_id: 'r' });
    expect(shape([zeta, alpha, root])).toEqual(['Root@0+', 'Alpha@1-', 'Zeta@1-']);
  });

  it('orders roots by title too', () => {
    const beta = makeTask({ id: 'b', title: 'Beta' });
    const alpha = makeTask({ id: 'a', title: 'Alpha' });
    expect(shape([beta, alpha])).toEqual(['Alpha@0-', 'Beta@0-']);
  });

  it('flags hasChildren only for tasks that actually have children in the set', () => {
    const p = makeTask({ id: 'p', title: 'Parent' });
    const c = makeTask({ id: 'c', title: 'Child', parent_id: 'p' });
    const leaf = makeTask({ id: 'l', title: 'Loner' });
    const rows = flattenItemTree([p, c, leaf]);
    const byTitleMap = new Map(rows.map((r) => [r.task.title, r.hasChildren]));
    expect(byTitleMap.get('Parent')).toBe(true);
    expect(byTitleMap.get('Child')).toBe(false);
    expect(byTitleMap.get('Loner')).toBe(false);
  });

  it('handles a deep chain with monotonically increasing depth', () => {
    const a = makeTask({ id: 'a', title: 'A' });
    const b = makeTask({ id: 'b', title: 'B', parent_id: 'a' });
    const c = makeTask({ id: 'c', title: 'C', parent_id: 'b' });
    const d = makeTask({ id: 'd', title: 'D', parent_id: 'c' });
    expect(shape([d, c, b, a])).toEqual(['A@0+', 'B@1+', 'C@2+', 'D@3-']);
  });

  it('promotes an orphan (parent not in the set) to a depth-0 root', () => {
    // Parent 'p' is absent — e.g. a filter hid it but kept the child.
    const child = makeTask({ id: 'c', title: 'Child', parent_id: 'p' });
    const other = makeTask({ id: 'o', title: 'Aother' });
    expect(shape([child, other])).toEqual(['Aother@0-', 'Child@0-']);
  });

  it('keeps every task exactly once even with a parent_id cycle', () => {
    // a → b → a is a loop the backend forbids; the walk must still terminate
    // and surface both tasks once.
    const a = makeTask({ id: 'a', title: 'A', parent_id: 'b' });
    const b = makeTask({ id: 'b', title: 'B', parent_id: 'a' });
    const rows = flattenItemTree([a, b]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.task.id))).toEqual(new Set(['a', 'b']));
  });

  it('honours a custom sibling comparator (e.g. due_date asc, nulls last)', () => {
    const root = makeTask({ id: 'r', title: 'Root' });
    const early = makeTask({ id: 'e', title: 'Zeta', parent_id: 'r', due_date: '2026-06-10' });
    const late = makeTask({ id: 'l', title: 'Alpha', parent_id: 'r', due_date: '2026-06-20' });
    const none = makeTask({ id: 'n', title: 'Beta', parent_id: 'r', due_date: null });
    const byDue: SiblingComparator = (a, b) => {
      if (a.due_date === null && b.due_date === null) return 0;
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    };
    // Sorted by due date within the sibling group, ignoring title order.
    expect(shape([none, late, early, root], byDue)).toEqual([
      'Root@0+',
      'Zeta@1-',
      'Alpha@1-',
      'Beta@1-',
    ]);
  });

  it('does not mutate the caller’s array', () => {
    const a = makeTask({ id: 'a', title: 'Beta' });
    const b = makeTask({ id: 'b', title: 'Alpha' });
    const input = [a, b];
    flattenItemTree(input);
    expect(input).toEqual([a, b]); // original order preserved
  });
});

describe('byTitle', () => {
  it('compares case-insensitively', () => {
    const a = makeTask({ id: 'a', title: 'apple' });
    const b = makeTask({ id: 'b', title: 'Banana' });
    expect(byTitle(a, b)).toBeLessThan(0);
  });
});

describe('lineageOf', () => {
  it('returns an empty array for a root', () => {
    const root = makeTask({ id: 'r', title: 'Root' });
    expect(lineageOf('r', [root])).toEqual([]);
  });

  it('returns ancestor titles from outermost root down to the parent', () => {
    const hw = makeTask({ id: 'hw', title: 'Hardware' });
    const board = makeTask({ id: 'tb', title: 'Tester board', parent_id: 'hw' });
    const rig = makeTask({ id: 'rig', title: 'Probe rig', parent_id: 'tb' });
    expect(lineageOf('rig', [hw, board, rig])).toEqual(['Hardware', 'Tester board']);
  });

  it('stops at the boundary when an ancestor is outside the set', () => {
    // 'tb' is present but its parent 'hw' is not in the set.
    const board = makeTask({ id: 'tb', title: 'Tester board', parent_id: 'hw' });
    const rig = makeTask({ id: 'rig', title: 'Probe rig', parent_id: 'tb' });
    expect(lineageOf('rig', [board, rig])).toEqual(['Tester board']);
  });

  it('terminates on a parent_id cycle', () => {
    const a = makeTask({ id: 'a', title: 'A', parent_id: 'b' });
    const b = makeTask({ id: 'b', title: 'B', parent_id: 'a' });
    // Must not loop forever; returns the finite chain it can walk.
    const chain = lineageOf('a', [a, b]);
    expect(chain.length).toBeLessThanOrEqual(2);
  });
});
