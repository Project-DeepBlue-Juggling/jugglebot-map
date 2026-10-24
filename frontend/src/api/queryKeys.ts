/**
 * React-Query cache keys. Every per-project key carries the project id
 * segment so cross-project cache writes are impossible by construction.
 */
export const qk = {
  // Workspace-level
  projects: ['projects'] as const,
  users: ['users'] as const,
  // The caller's own row, keyed by user id.
  me: (userId: string) => ['users', 'me', userId] as const,

  // Per-project
  project: (projectId: string) => ['projects', projectId] as const,
  memberships: (projectId: string) => ['projects', projectId, 'memberships'] as const,
  tasks: {
    list: (projectId: string) => ['projects', projectId, 'tasks'] as const,
    detail: (projectId: string, taskId: string) =>
      ['projects', projectId, 'tasks', taskId] as const,
  },
  dependencies: (projectId: string) => ['projects', projectId, 'dependencies'] as const,
} as const;
