import { describe, expect, it } from 'vitest';
import type { Task, TaskStatus } from '../api/schemas';
import { resolveDropCascade } from './dropCascade';

/** ADR 0075 §11-13 — which open work a drop would carry with it. */

const NOW = '2026-09-13T00:00:00Z';
const DEV_ID = '00000000-0000-0000-0000-000000000001';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    project_id: '00000000-0000-0000-0000-0000000000aa',
    parent_id: null,
    title: `Task ${overrides.id}`,
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
    effective_start_date: '2026-09-13',
    created_at: NOW,
    created_by: DEV_ID,
    updated_at: NOW,
    updated_by: DEV_ID,
    ...overrides,
  };
}

const leaf = (id: string, status: TaskStatus, parent: string | null = null): Task =>
  makeTask({ id, parent_id: parent, status });
const section = (id: string, parent: string | null = null): Task =>
  makeTask({ id, parent_id: parent, is_section: true });

const titles = (tasks: readonly Task[]): string[] => tasks.map((t) => t.id).sort();

describe('resolveDropCascade — when it offers at all', () => {
  it('offers nothing when the change is not a drop', () => {
    const parent = leaf('p', 'in_progress');
    const child = leaf('c', 'in_progress', 'p');
    expect(resolveDropCascade(parent, { nextStatus: 'complete' }, [parent, child])).toEqual([]);
    expect(resolveDropCascade(parent, { nextStatus: 'blocked' }, [parent, child])).toEqual([]);
  });

  it('offers nothing when the status is untouched (a save of some other field)', () => {
    const parent = leaf('p', 'in_progress');
    const child = leaf('c', 'in_progress', 'p');
    expect(resolveDropCascade(parent, {}, [parent, child])).toEqual([]);
    expect(resolveDropCascade(parent, { nextStatus: undefined }, [parent, child])).toEqual([]);
  });

  it('offers nothing when the task is already dropped — re-selecting is not a transition', () => {
    // Otherwise re-picking Dropped would keep re-offering to cascade over work
    // the user deliberately chose to leave open the first time.
    const parent = leaf('p', 'dropped');
    const child = leaf('c', 'in_progress', 'p');
    expect(resolveDropCascade(parent, { nextStatus: 'dropped' }, [parent, child])).toEqual([]);
  });

  it('offers nothing when the task is a leaf with no children', () => {
    const parent = leaf('p', 'in_progress');
    expect(resolveDropCascade(parent, { nextStatus: 'dropped' }, [parent])).toEqual([]);
  });
});

describe('resolveDropCascade — what it targets', () => {
  it('collects the open work beneath the task', () => {
    const p = leaf('p', 'in_progress');
    const tasks = [
      p,
      leaf('a', 'in_progress', 'p'),
      leaf('b', 'blocked', 'p'),
      leaf('c', 'qa', 'p'),
    ];
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('leaves completed sub-tasks alone — that work was actually done', () => {
    // The record of what was achieved is exactly what this status exists to
    // keep; rewriting it would destroy it.
    const p = leaf('p', 'in_progress');
    const tasks = [p, leaf('done', 'complete', 'p'), leaf('open', 'not_started', 'p')];
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks))).toEqual(['open']);
  });

  it('skips sub-tasks that are already dropped', () => {
    const p = leaf('p', 'in_progress');
    const tasks = [p, leaf('gone', 'dropped', 'p'), leaf('open', 'in_progress', 'p')];
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks))).toEqual(['open']);
  });

  it('reaches the whole subtree, not just direct children', () => {
    // A branch is abandoned at its root; the leaves two levels down are
    // exactly the ones the user would otherwise never find again.
    const p = leaf('p', 'in_progress');
    const tasks = [
      p,
      leaf('a', 'in_progress', 'p'),
      leaf('a1', 'not_started', 'a'),
      leaf('a2', 'blocked', 'a'),
      leaf('a1x', 'qa', 'a1'),
    ];
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks))).toEqual([
      'a',
      'a1',
      'a1x',
      'a2',
    ]);
  });

  it('skips sections but still descends through them', () => {
    // A section has no meaningful stored status (ADR 0048) — it rolls up to
    // dropped on its own once its children are (ADR 0075 §9). Its children
    // still need dropping.
    const p = leaf('p', 'in_progress');
    const tasks = [p, section('s', 'p'), leaf('under', 'in_progress', 's')];
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks))).toEqual(['under']);
  });

  it('never includes the task being dropped itself', () => {
    const p = leaf('p', 'in_progress');
    const tasks = [p, leaf('c', 'in_progress', 'p')];
    const result = resolveDropCascade(p, { nextStatus: 'dropped' }, tasks);
    expect(result.map((t) => t.id)).not.toContain('p');
  });

  it('ignores tasks elsewhere in the project', () => {
    const p = leaf('p', 'in_progress');
    const tasks = [p, leaf('mine', 'in_progress', 'p'), leaf('unrelated', 'in_progress')];
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks))).toEqual(['mine']);
  });

  it('a section whose every child is complete offers nothing', () => {
    const p = leaf('p', 'in_progress');
    const tasks = [p, leaf('a', 'complete', 'p'), leaf('b', 'complete', 'p')];
    expect(resolveDropCascade(p, { nextStatus: 'dropped' }, tasks)).toEqual([]);
  });

  it('terminates on a malformed cyclic graph rather than looping forever', () => {
    // The server enforces acyclicity (ADR 0029); this is the same defensive
    // stance buildEffectiveStatusIndex takes against a graph that isn't.
    const p = makeTask({ id: 'p', parent_id: 'c', status: 'in_progress' });
    const c = makeTask({ id: 'c', parent_id: 'p', status: 'in_progress' });
    expect(titles(resolveDropCascade(p, { nextStatus: 'dropped' }, [p, c]))).toEqual(['c']);
  });
});
