import type { QueryClient } from '@tanstack/react-query';
import { qk } from './queryKeys';
import type { DependencyEdge, Project, Task, TaskDetail, ItemTreeEvent } from './schemas';

/**
 * Pure cache mutators for incoming SSE events (ADRs 0014, 0015, 0022).
 *
 * Each function patches the relevant TanStack Query caches **in place**
 * via `setQueryData` rather than `invalidateQueries`. Phase 3's perf
 * finding (canvas at ~28-30 fps with the 500-task fixture) rules out a
 * full refetch on every mutation.
 *
 * The reducer is **idempotent**: applying the same event twice produces
 * the same final state. We rely on this when the user's own mutation's
 * response and the SSE echo of the same mutation both write to the cache —
 * the second write is structurally identical and TanStack Query's
 * shallow-equality check skips the re-render.
 *
 * Phase 5.5: every event carries `project_id` on its envelope (ADR 0022).
 * The reducer threads it through to the project-scoped cache keys so a
 * single QueryClient can hold caches for multiple projects without
 * cross-write.
 */

export function applyEvent(qc: QueryClient, event: ItemTreeEvent): void {
  switch (event.type) {
    case 'task.created':
      applyTaskUpsert(qc, event.project_id, event.task);
      return;
    case 'task.updated':
      applyTaskUpsert(qc, event.project_id, event.task);
      return;
    case 'task.deleted':
      applyTaskDeleted(qc, event.project_id, event.task_id);
      return;
    case 'dependency.created':
      applyDependencyCreated(qc, event.project_id, event.dependency);
      return;
    case 'dependency.deleted':
      applyDependencyDeleted(qc, event.project_id, event.dependency_id);
      return;
    case 'project.updated':
      qc.setQueryData<Project>(qk.project(event.project_id), event.project);
      // The project may also appear in the collection list cache; patch there too.
      qc.setQueryData<Project[]>(qk.projects, (prev) => {
        if (prev === undefined) return prev;
        const idx = prev.findIndex((p) => p.id === event.project.id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = event.project;
        return next;
      });
      return;
  }
}

/**
 * Insert-or-replace a task in both the list cache and its own detail cache.
 *
 * For `task.created` and `task.updated` events the network shape is the
 * same `Task` row; the difference is only whether the task is already in
 * the list. We dedupe by id so a duplicate echo does not create a phantom
 * row, and preserve the existing `blocking` / `blocked_by` arrays on the
 * detail cache (the event payload doesn't carry edges; those arrive via
 * dedicated dependency events).
 */
function applyTaskUpsert(qc: QueryClient, projectId: string, task: Task): void {
  qc.setQueryData<Task[]>(qk.tasks.list(projectId), (prev) => {
    if (prev === undefined) return [task];
    const idx = prev.findIndex((t) => t.id === task.id);
    if (idx === -1) return [...prev, task];
    const existing = prev[idx];
    if (existing !== undefined && sameTask(existing, task)) return prev;
    const next = prev.slice();
    next[idx] = task;
    return next;
  });

  qc.setQueryData<TaskDetail>(qk.tasks.detail(projectId, task.id), (prev) => {
    if (prev === undefined) {
      // No-op: don't speculatively populate an incomplete TaskDetail
      // (we don't know the edges yet). The next `useTask(id)` call
      // will fetch fresh.
      return undefined;
    }
    if (sameTask(prev, task)) return prev;
    return { ...prev, ...task };
  });
}

function applyTaskDeleted(qc: QueryClient, projectId: string, taskId: string): void {
  qc.removeQueries({ queryKey: qk.tasks.detail(projectId, taskId) });
  qc.setQueryData<Task[]>(qk.tasks.list(projectId), (prev) => {
    if (prev === undefined) return prev;
    const next = prev.filter((t) => t.id !== taskId);
    return next.length === prev.length ? prev : next;
  });
}

function applyDependencyCreated(qc: QueryClient, projectId: string, dep: DependencyEdge): void {
  qc.setQueryData<DependencyEdge[]>(qk.dependencies(projectId), (prev) => {
    if (prev === undefined) return [dep];
    if (prev.some((d) => d.id === dep.id)) return prev;
    return [...prev, dep];
  });
  // Patch the affected task details if they're cached. Don't speculatively
  // create them if absent — the next useTask fetch will pick up the edge.
  qc.setQueryData<TaskDetail>(qk.tasks.detail(projectId, dep.blocker_id), (prev) => {
    if (prev === undefined) return undefined;
    if (prev.blocking.some((d) => d.id === dep.id)) return prev;
    return { ...prev, blocking: [...prev.blocking, dep] };
  });
  qc.setQueryData<TaskDetail>(qk.tasks.detail(projectId, dep.blocked_id), (prev) => {
    if (prev === undefined) return undefined;
    if (prev.blocked_by.some((d) => d.id === dep.id)) return prev;
    return { ...prev, blocked_by: [...prev.blocked_by, dep] };
  });
}

function applyDependencyDeleted(qc: QueryClient, projectId: string, depId: string): void {
  qc.setQueryData<DependencyEdge[]>(qk.dependencies(projectId), (prev) => {
    if (prev === undefined) return prev;
    const next = prev.filter((d) => d.id !== depId);
    return next.length === prev.length ? prev : next;
  });
  // Strip the edge from any cached task detail in this project. The event
  // carries only the dependency id, so scan every detail entry under the
  // project key and rewrite if changed.
  qc.setQueriesData<TaskDetail>({ queryKey: ['projects', projectId, 'tasks'] }, (prev) => {
    if (prev === undefined) return prev;
    if (!('blocking' in prev) || !('blocked_by' in prev)) return prev;
    const blocking = prev.blocking.filter((d) => d.id !== depId);
    const blockedBy = prev.blocked_by.filter((d) => d.id !== depId);
    if (blocking.length === prev.blocking.length && blockedBy.length === prev.blocked_by.length) {
      return prev;
    }
    return { ...prev, blocking, blocked_by: blockedBy };
  });
}

/**
 * Shallow equality on the Task wire shape. Used to skip cache writes when
 * the incoming row is structurally identical to the cached row (the common
 * case when a mutation's response and its SSE echo both arrive).
 */
function sameTask(a: Task, b: Task): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.completion_criteria === b.completion_criteria &&
    sameAssigneeIds(a.assignee_ids, b.assignee_ids) &&
    a.parent_id === b.parent_id &&
    a.stage === b.stage &&
    a.status === b.status &&
    a.is_section === b.is_section &&
    a.color === b.color &&
    a.canvas_x === b.canvas_x &&
    a.canvas_y === b.canvas_y &&
    a.canvas_collapsed === b.canvas_collapsed &&
    a.due_date === b.due_date &&
    a.start_date === b.start_date &&
    a.effective_start_date === b.effective_start_date &&
    a.updated_at === b.updated_at &&
    a.updated_by === b.updated_by
  );
}

/** Order-sensitive equality on assignee lists. The server returns them
 *  sorted by user.display_name (ADR 0034), so a positional compare is
 *  the right shape — a reordering would indicate the user list changed
 *  upstream and the cache should re-render the "first assignee" colour. */
function sameAssigneeIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
