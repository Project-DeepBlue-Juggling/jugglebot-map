import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { applyEvent } from './eventReducer';
import { qk } from './queryKeys';
import type { DependencyEdge, Project, Task, TaskDetail } from './schemas';

/**
 * Tests for the SSE -> cache reducer (ADRs 0014, 0015, 0022).
 *
 * Pin the contract: each event type lands in the right project-scoped
 * cache, applies in place (no `invalidateQueries`), and is idempotent —
 * applying twice leaves the cache structurally identical.
 */

const PROJECT_ID = '00000000-0000-0000-0000-00000000aaaa';
const PROJECT_ID_OTHER = '00000000-0000-0000-0000-00000000bbbb';

const TASK_A: Task = {
  id: '11111111-1111-1111-1111-111111111111',
  project_id: PROJECT_ID,
  parent_id: null,
  title: 'Task A',
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
  effective_start_date: '2026-05-13',
  created_at: '2026-05-06T00:00:00Z',
  created_by: '00000000-0000-0000-0000-0000000000aa',
  updated_at: '2026-05-06T00:00:00Z',
  updated_by: '00000000-0000-0000-0000-0000000000aa',
};

const TASK_B: Task = { ...TASK_A, id: '22222222-2222-2222-2222-222222222222', title: 'Task B' };

const DEP_A_TO_B: DependencyEdge = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  blocker_id: TASK_A.id,
  blocked_id: TASK_B.id,
  created_at: '2026-05-06T00:00:00Z',
  created_by: '00000000-0000-0000-0000-0000000000aa',
};

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const SYNTH_ENVELOPE = {
  seq: 1,
  project_id: PROJECT_ID,
  actor_id: '00000000-0000-0000-0000-0000000000aa',
  at: '2026-05-06T00:00:00Z',
};

describe('applyEvent — task.created', () => {
  it('appends to an existing list cache', () => {
    const qc = freshClient();
    qc.setQueryData<Task[]>(qk.tasks.list(PROJECT_ID), [TASK_A]);

    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.created', task: TASK_B });

    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID))).toEqual([TASK_A, TASK_B]);
  });

  it('seeds the list when the cache is empty', () => {
    const qc = freshClient();
    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.created', task: TASK_A });
    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID))).toEqual([TASK_A]);
  });

  it('is idempotent: duplicate event leaves the list unchanged', () => {
    const qc = freshClient();
    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.created', task: TASK_A });
    const before = qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID));
    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.created', task: TASK_A });
    const after = qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID));
    expect(after).toBe(before); // same reference; no spurious re-render
  });

  it('does not leak into another projects list cache (cross-project filter)', () => {
    const qc = freshClient();
    qc.setQueryData<Task[]>(qk.tasks.list(PROJECT_ID_OTHER), []);
    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.created', task: TASK_A });
    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID_OTHER))).toEqual([]);
    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID))).toEqual([TASK_A]);
  });
});

describe('applyEvent — task.updated', () => {
  it('replaces the task in the list cache', () => {
    const qc = freshClient();
    qc.setQueryData<Task[]>(qk.tasks.list(PROJECT_ID), [TASK_A, TASK_B]);
    const renamed = { ...TASK_A, title: 'Renamed', updated_at: '2026-05-06T00:00:01Z' };

    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.updated', task: renamed });

    const list = qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID));
    expect(list).toHaveLength(2);
    expect(list?.[0]?.title).toBe('Renamed');
    expect(list?.[1]).toEqual(TASK_B);
  });

  it('patches the detail cache when present, preserving edge arrays', () => {
    const qc = freshClient();
    const detail: TaskDetail = { ...TASK_A, blocking: [DEP_A_TO_B], blocked_by: [] };
    qc.setQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id), detail);

    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'task.updated',
      task: { ...TASK_A, title: 'Renamed', updated_at: '2026-05-06T00:00:01Z' },
    });

    const cached = qc.getQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id));
    expect(cached?.title).toBe('Renamed');
    expect(cached?.blocking).toEqual([DEP_A_TO_B]); // preserved
    expect(cached?.blocked_by).toEqual([]);
  });

  it('does not speculatively populate an absent detail cache', () => {
    const qc = freshClient();
    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.updated', task: TASK_A });
    expect(qc.getQueryData(qk.tasks.detail(PROJECT_ID, TASK_A.id))).toBeUndefined();
  });

  it('preserves list reference when the row is structurally identical', () => {
    const qc = freshClient();
    qc.setQueryData<Task[]>(qk.tasks.list(PROJECT_ID), [TASK_A]);
    const before = qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID));

    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.updated', task: TASK_A });

    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID))).toBe(before);
  });
});

describe('applyEvent — task.deleted', () => {
  it('removes the task from the list and drops its detail cache', () => {
    const qc = freshClient();
    qc.setQueryData<Task[]>(qk.tasks.list(PROJECT_ID), [TASK_A, TASK_B]);
    qc.setQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id), {
      ...TASK_A,
      blocking: [],
      blocked_by: [],
    });

    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.deleted', task_id: TASK_A.id });

    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID))).toEqual([TASK_B]);
    expect(qc.getQueryState(qk.tasks.detail(PROJECT_ID, TASK_A.id))).toBeUndefined();
  });

  it('is idempotent: deleting an absent id is a no-op', () => {
    const qc = freshClient();
    qc.setQueryData<Task[]>(qk.tasks.list(PROJECT_ID), [TASK_B]);
    const before = qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID));

    applyEvent(qc, { ...SYNTH_ENVELOPE, type: 'task.deleted', task_id: TASK_A.id });

    expect(qc.getQueryData<Task[]>(qk.tasks.list(PROJECT_ID))).toBe(before);
  });
});

describe('applyEvent — dependency.created', () => {
  it('appends to the dependencies list and patches affected task details', () => {
    const qc = freshClient();
    qc.setQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID), []);
    qc.setQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id), {
      ...TASK_A,
      blocking: [],
      blocked_by: [],
    });
    qc.setQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_B.id), {
      ...TASK_B,
      blocking: [],
      blocked_by: [],
    });

    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'dependency.created',
      dependency: DEP_A_TO_B,
    });

    expect(qc.getQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID))).toEqual([DEP_A_TO_B]);
    const blockerDetail = qc.getQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id));
    expect(blockerDetail?.blocking).toEqual([DEP_A_TO_B]);
    const blockedDetail = qc.getQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_B.id));
    expect(blockedDetail?.blocked_by).toEqual([DEP_A_TO_B]);
  });

  it('is idempotent: duplicate id leaves caches unchanged', () => {
    const qc = freshClient();
    qc.setQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID), [DEP_A_TO_B]);
    const before = qc.getQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID));

    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'dependency.created',
      dependency: DEP_A_TO_B,
    });

    expect(qc.getQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID))).toBe(before);
  });

  it('does not speculatively populate absent detail caches', () => {
    const qc = freshClient();
    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'dependency.created',
      dependency: DEP_A_TO_B,
    });
    expect(qc.getQueryData(qk.tasks.detail(PROJECT_ID, TASK_A.id))).toBeUndefined();
    expect(qc.getQueryData(qk.tasks.detail(PROJECT_ID, TASK_B.id))).toBeUndefined();
  });
});

describe('applyEvent — dependency.deleted', () => {
  it('removes from the dependencies list and strips from cached task details', () => {
    const qc = freshClient();
    qc.setQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID), [DEP_A_TO_B]);
    qc.setQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id), {
      ...TASK_A,
      blocking: [DEP_A_TO_B],
      blocked_by: [],
    });
    qc.setQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_B.id), {
      ...TASK_B,
      blocking: [],
      blocked_by: [DEP_A_TO_B],
    });

    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'dependency.deleted',
      dependency_id: DEP_A_TO_B.id,
    });

    expect(qc.getQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID))).toEqual([]);
    expect(qc.getQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_A.id))?.blocking).toEqual(
      [],
    );
    expect(qc.getQueryData<TaskDetail>(qk.tasks.detail(PROJECT_ID, TASK_B.id))?.blocked_by).toEqual(
      [],
    );
  });

  it('is idempotent: deleting an absent id is a no-op', () => {
    const qc = freshClient();
    qc.setQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID), []);
    const before = qc.getQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID));

    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'dependency.deleted',
      dependency_id: DEP_A_TO_B.id,
    });

    expect(qc.getQueryData<DependencyEdge[]>(qk.dependencies(PROJECT_ID))).toBe(before);
  });
});

describe('applyEvent — project.updated', () => {
  it('overwrites the project cache', () => {
    const qc = freshClient();
    const before: Project = {
      id: PROJECT_ID,
      name: 'Old',
      stages: ['a'],
      due_date_warning_days: 7,
      brief_enabled: false,
      bom_enabled: false,
      created_at: '2026-05-06T00:00:00Z',
      created_by: '00000000-0000-0000-0000-0000000000aa',
    };
    qc.setQueryData<Project>(qk.project(PROJECT_ID), before);

    applyEvent(qc, {
      ...SYNTH_ENVELOPE,
      type: 'project.updated',
      project: { ...before, name: 'New', stages: ['a', 'b'] },
    });

    const after = qc.getQueryData<Project>(qk.project(PROJECT_ID));
    expect(after?.name).toBe('New');
    expect(after?.stages).toEqual(['a', 'b']);
  });
});
