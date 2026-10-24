import { describe, expect, it } from 'vitest';
import type { Task } from '../api/schemas';
import { normalizeQuery, searchTasks } from './searchMatch';

function task(id: string, title: string): Task {
  return {
    id,
    project_id: 'p',
    parent_id: null,
    title,
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
    effective_start_date: '2026-06-11',
    created_at: '2026-06-11T00:00:00Z',
    created_by: 'u',
    updated_at: '2026-06-11T00:00:00Z',
    updated_by: 'u',
  };
}

const TASKS: Task[] = [
  task('1', 'Design chassis'),
  task('2', 'Order motors'),
  task('3', 'Motor mount bracket'),
];

describe('normalizeQuery', () => {
  it('trims and lower-cases', () => {
    expect(normalizeQuery('  Motor ')).toBe('motor');
  });
});

describe('searchTasks', () => {
  it('returns nothing for a blank or whitespace-only query', () => {
    expect(searchTasks(TASKS, '')).toEqual([]);
    expect(searchTasks(TASKS, '   ')).toEqual([]);
  });

  it('matches title as a case-insensitive substring', () => {
    const titles = searchTasks(TASKS, 'motor').map((t) => t.title);
    // Both "Order motors" and "Motor mount bracket" contain "motor".
    expect(titles).toEqual(['Motor mount bracket', 'Order motors']); // sorted by title
  });

  it('is case-insensitive', () => {
    expect(searchTasks(TASKS, 'DESIGN').map((t) => t.id)).toEqual(['1']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchTasks(TASKS, 'zzz')).toEqual([]);
  });

  it('sorts results by title, not input order', () => {
    const out = searchTasks(
      [task('a', 'Zeta'), task('b', 'Alpha'), task('c', 'alpha beta')],
      'a',
    ).map((t) => t.title);
    expect(out).toEqual(['Alpha', 'alpha beta', 'Zeta']);
  });
});
