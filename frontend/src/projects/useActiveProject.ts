import { useContext } from 'react';
import { ActiveProjectCtx, type ActiveProjectValue } from './activeProjectContextValue';

/** Read the active-project context (URL-driven project id + caller's role). */
export function useActiveProject(): ActiveProjectValue {
  const ctx = useContext(ActiveProjectCtx);
  if (ctx === null) {
    throw new Error('useActiveProject must be used inside an ActiveProjectProvider');
  }
  return ctx;
}

/**
 * Convenience: the project id, or throw if the calling component is not
 * inside a project route. Use in hooks that fundamentally need a project
 * — `useTasks`, `useCreateTask`, etc.
 */
export function useActiveProjectId(): string {
  const { projectId } = useActiveProject();
  if (projectId === null) {
    throw new Error(
      'useActiveProjectId called outside a project route. ' +
        'Wrap consumers in ActiveProjectProvider under /projects/:projectId/...',
    );
  }
  return projectId;
}
