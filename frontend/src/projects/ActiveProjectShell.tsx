import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { qk } from '../api/queryKeys';
import { useApi } from '../api/useApi';
import { useAuth } from '../auth/useAuth';
import { SearchProvider } from '../search/SearchProvider';
import { CompletionReminderProvider } from '../tasks/CompletionReminderProvider';
import { DropCascadeProvider } from '../tasks/DropCascadeProvider';
import { ActiveProjectProvider } from './ActiveProjectContext';

/**
 * Wraps the project-scoped routes (`/projects/:projectId/*`) with the
 * ActiveProject context and the SSE stream. An unknown project id (404)
 * falls back to the root redirect, which picks the server's one project.
 */
export default function ActiveProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  const api = useApi();
  const { user } = useAuth();

  const probe = useQuery({
    queryKey: qk.project(projectId ?? 'invalid'),
    queryFn: () => {
      if (projectId === undefined) throw new Error('invalid project id');
      return api.getProject(projectId);
    },
    enabled: projectId !== undefined && user !== null,
    retry: false,
  });

  if (
    probe.error instanceof ApiError &&
    (probe.error.status === 404 || probe.error.status === 422)
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <ActiveProjectProvider>
      <CompletionReminderProvider>
        <DropCascadeProvider>
          <SearchProvider>
            <Outlet />
          </SearchProvider>
        </DropCascadeProvider>
      </CompletionReminderProvider>
    </ActiveProjectProvider>
  );
}
