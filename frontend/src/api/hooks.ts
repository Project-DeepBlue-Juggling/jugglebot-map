import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useApi } from './useApi';
import { qk } from './queryKeys';
import { useActiveProjectId } from '../projects/useActiveProject';
import { useAuth } from '../auth/useAuth';
import type {
  CurrentUser,
  DependencyCreateBody,
  Task,
  TaskCreateBody,
  TaskUpdateBody,
  User,
  UserPatchSelfBody,
} from './schemas';

/**
 * React-Query hooks for v1 + Phase 5.5 endpoints.
 *
 * Cache-update strategy is **response-driven** per ADR 0015: on success
 * we patch the cache from the server's response body via `setQueryData`
 * (never `invalidateQueries`, which would force a refetch and break
 * Phase 3's 500-task perf target). Incoming SSE events for the same
 * mutation are then idempotent — the response and the echo carry the
 * same row, so the second `setQueryData` is a no-op for stable references.
 *
 * Phase 5.5: every query is project-scoped via `useActiveProjectId()`.
 * Components inside a `/projects/:projectId/...` route don't pass the
 * project id explicitly; the hooks read it from context.
 */

// -- Project collection + instance ----------------------------------------

export function useProjects() {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => api.listProjects(),
    enabled: user !== null,
  });
}

// -- Memberships ----------------------------------------------------------

export function useMemberships() {
  const api = useApi();
  const projectId = useActiveProjectId();
  return useQuery({
    queryKey: qk.memberships(projectId),
    queryFn: () => api.listMemberships(projectId),
  });
}

// -- Users ----------------------------------------------------------------

export function useUsers() {
  const api = useApi();
  return useQuery({ queryKey: qk.users, queryFn: () => api.getUsers() });
}

/**
 * The caller's own row — the source of the two availability nav bits
 * (ADR 0063 §6). `useUsers()` cannot answer `is_availability_member`:
 * that bit is computed and rides only `/users/me`, deliberately, to keep a
 * per-row membership subquery off the whole directory.
 *
 * `refetchOnWindowFocus` is the freshness mechanism: membership changes
 * emit no SSE (ADR 0063 §9), so a person removed while their tab is open
 * keeps the nav entry until they come back to the tab — at which point the
 * entry disappears and, had they clicked it, the server's 403 would have
 * produced the no-access panel anyway.
 */
export function useCurrentUser() {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.me(user?.id ?? 'none'),
    queryFn: () => api.getMe(),
    enabled: user !== null,
    refetchOnWindowFocus: true,
  });
}

/**
 * Users who can be assigned to a task in the active project (ADR 0021
 * amended — Checkpoint 3 feedback). Intersects the workspace user list
 * with the active project's memberships, so the assignee picker only
 * shows project members. The role distinction (viewer vs editor) is
 * NOT applied here: both roles are valid assignees on the backend
 * (a viewer with a task assignment can still see the task; assignment
 * is orthogonal to edit access).
 *
 * Returns the same shape `useUsers()` does, just filtered. Loading
 * state is true while either source query is in flight.
 */
export function useProjectAssignees() {
  const users = useUsers();
  const memberships = useMemberships();
  const assignees =
    users.data === undefined || memberships.data === undefined
      ? undefined
      : (() => {
          const memberIds = new Set(memberships.data.map((m) => m.user_id));
          return users.data.filter((u) => memberIds.has(u.id));
        })();
  return {
    data: assignees,
    isLoading: users.isLoading || memberships.isLoading,
    error: users.error ?? memberships.error,
  };
}

export function usePatchSelf() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPatchSelfBody) => api.patchSelf(body),
    onSuccess: (updated: CurrentUser) => {
      // Both caches, from one response: the directory row the theme
      // provider reads, and the `me` row the nav gates on. The endpoint
      // returns `CurrentUserRead` precisely so this write cannot drop the
      // availability bits and flicker the nav entry off.
      qc.setQueryData<CurrentUser>(qk.me(updated.id), updated);
      qc.setQueryData<User[]>(qk.users, (prev) => {
        if (prev === undefined) return [updated];
        const idx = prev.findIndex((u) => u.id === updated.id);
        if (idx === -1) return [...prev, updated];
        const next = prev.slice();
        next[idx] = updated;
        return next;
      });
    },
  });
}

// -- Tasks (project-scoped) -----------------------------------------------

export function useTasks() {
  const api = useApi();
  const projectId = useActiveProjectId();
  return useQuery({
    queryKey: qk.tasks.list(projectId),
    queryFn: () => api.getTasks(projectId),
  });
}

export function useDependencies() {
  const api = useApi();
  const projectId = useActiveProjectId();
  return useQuery({
    queryKey: qk.dependencies(projectId),
    queryFn: () => api.getDependencies(projectId),
  });
}

export function useTask(id: string | null) {
  const api = useApi();
  const projectId = useActiveProjectId();
  return useQuery({
    queryKey:
      id === null ? ['projects', projectId, 'tasks', 'none'] : qk.tasks.detail(projectId, id),
    queryFn: () => {
      if (id === null) throw new Error('useTask called with null id');
      return api.getTask(projectId, id);
    },
    enabled: id !== null,
  });
}

export function useCreateTask() {
  const api = useApi();
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  return useMutation({
    mutationFn: (body: TaskCreateBody) => api.createTask(projectId, body),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function usePatchTask() {
  const api = useApi();
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskUpdateBody }) =>
      api.patchTask(projectId, id, body),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

/**
 * Optimistically merge a `TaskUpdate` body into the cached task list and return
 * a rollback to the prior snapshot. `usePatchTask` only patches the cache from
 * the server response (one round-trip), so hand-driven edits — the list status
 * dropdown, the detail-panel save — feel laggy on anything that derives from
 * the cache, notably a section's progress bar (ADR 0048 amendment). Call this
 * before `patch.mutateAsync` for an instant update; roll back on error; the
 * server response reconciles on success (idempotent via `sameTask`). Mirrors
 * the manual optimistic writes the Board and Timeline already do.
 */
export function useOptimisticTaskPatch(): (taskId: string, body: TaskUpdateBody) => () => void {
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  return useCallback(
    (taskId: string, body: TaskUpdateBody) => {
      const key = qk.tasks.list(projectId);
      const snapshot = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (prev) => {
        if (prev === undefined) return prev;
        const idx = prev.findIndex((t) => t.id === taskId);
        if (idx === -1) return prev;
        const existing = prev[idx];
        if (existing === undefined) return prev;
        const merged: Task = { ...existing };
        for (const [k, v] of Object.entries(body)) {
          // `if_unchanged_since` is a concurrency token, not a Task column.
          if (k === 'if_unchanged_since') continue;
          (merged as Record<string, unknown>)[k] = v;
        }
        const next = prev.slice();
        next[idx] = merged;
        return next;
      });
      return () => {
        if (snapshot !== undefined) qc.setQueryData(key, snapshot);
      };
    },
    [qc, projectId],
  );
}

export function useDeleteTask() {
  const api = useApi();
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(projectId, id),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useCreateDependency() {
  const api = useApi();
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  return useMutation({
    mutationFn: (body: DependencyCreateBody) => api.createDependency(projectId, body),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useDeleteDependency() {
  const api = useApi();
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  return useMutation({
    mutationFn: ({ id }: { id: string; blockerId: string; blockedId: string }) =>
      api.deleteDependency(projectId, id),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

/** Server health: polled every 15 s, and refetched on every `invalidate` event. */
export function useHealth() {
  const api = useApi();
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api.getHealth(),
    refetchInterval: 15_000,
  });
}
