import { useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import { qk } from '../api/queryKeys';
import { useAuth } from '../auth/useAuth';
import { ActiveProjectCtx, type ActiveProjectValue } from './activeProjectContextValue';

/**
 * Active-project context (ADR 0020 routing + ADR 0021 role gating).
 *
 * Reads `:projectId` from the URL via react-router's useParams, fetches
 * the project metadata + the caller's memberships, and exposes a stable
 * `(project, role)` pair to every hook below.
 *
 * **The `projectId` prop overrides the URL** (ADR 0076 section 8). A
 * workspace-level page has no `:projectId` to read, but may still need to
 * address one project's data - My tasks opens the Task detail panel for a
 * task that could belong to any project. Supplying the id here lets the
 * entire subtree beneath it (useTask, useTasks, usePatchTask, the comment
 * hooks - every hook built on `useActiveProjectId`) work unchanged and
 * unaware it is off-route. The alternative was re-parameterising the most
 * widely used component in the app by project id.
 *
 * The prop wins over the URL when both are present, which never happens
 * today; if it ever does, the explicit value is the more deliberate one.
 *
 * Role is derived from the project listing (GET /api/v1/projects), which
 * carries only projects the caller is a member of. If the URL points at
 * a project the caller is not a member of, the backend will already have
 * 404'd the GET, but here we return `role = null` so consumers can
 * choose to redirect to the picker.
 *
 * The hook (useActiveProject) and the type (ActiveProjectValue) live in
 * sibling modules so this file exports only the provider component —
 * react-refresh's only-export-components rule.
 */

export function ActiveProjectProvider({
  children,
  projectId: projectIdOverride,
}: {
  children: ReactNode;
  projectId?: string;
}) {
  const params = useParams<{ projectId?: string }>();
  const projectId = projectIdOverride ?? params.projectId ?? null;
  const api = useApi();
  const { user } = useAuth();

  const projectQuery = useQuery({
    queryKey: projectId !== null ? qk.project(projectId) : ['projects', 'none'],
    queryFn: () => {
      if (projectId === null) throw new Error('Project query without id');
      return api.getProject(projectId);
    },
    enabled: projectId !== null && user !== null,
  });

  const value = useMemo<ActiveProjectValue>(() => {
    const project = projectQuery.data ?? null;
    return {
      projectId,
      project,
      isLoading: projectQuery.isLoading,
    };
  }, [projectId, projectQuery.data, projectQuery.isLoading]);

  return <ActiveProjectCtx.Provider value={value}>{children}</ActiveProjectCtx.Provider>;
}
