import { createContext } from 'react';
import type { Project } from '../api/schemas';

/**
 * Shared types + the React context object for the active-project layer.
 * Split into its own module so the hook (useActiveProject) and the
 * provider component (ActiveProjectProvider) live in different files —
 * `react-refresh/only-export-components` requires component files to
 * export only components for HMR to work correctly.
 */

export interface ActiveProjectValue {
  /** Project id from the URL, or null when the route isn't project-scoped. */
  projectId: string | null;
  /** The project's metadata, or null while loading / on 404. */
  project: Project | null;
  /** True until the membership/project queries resolve. */
  isLoading: boolean;
}

export const ActiveProjectCtx = createContext<ActiveProjectValue | null>(null);
