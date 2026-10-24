import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { useActiveProject } from '../projects/useActiveProject';
import { qk } from './queryKeys';

/**
 * Server-sent events client. The server emits `event: invalidate` whenever
 * something changed; on each one we refetch the project, its tasks and its
 * dependencies. The browser reconnects by itself, so there is no cursor to
 * manage here.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1';

export function EventStreamProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { projectId } = useActiveProject();

  useEffect(() => {
    if (user === null || projectId === null) return;
    const source = new EventSource(
      new URL(`${BASE_URL}/events`, window.location.origin).toString(),
    );
    source.addEventListener('invalidate', () => {
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      void qc.invalidateQueries({ queryKey: qk.tasks.list(projectId) });
      void qc.invalidateQueries({ queryKey: qk.dependencies(projectId) });
    });
    return () => source.close();
  }, [qc, user, projectId]);

  return <>{children}</>;
}
