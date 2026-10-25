import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { qk } from '../api/queryKeys';
import { useApi } from '../api/useApi';
import { useAuth } from '../auth/useAuth';
import { SearchBar } from '../features/search/SearchBar';
import { DrawerProvider } from '../features/drawer/DrawerProvider';
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
      <DrawerProvider>
        <div className="flex h-full flex-col overflow-hidden">
          <SearchBar />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </DrawerProvider>
    </ActiveProjectProvider>
  );
}
