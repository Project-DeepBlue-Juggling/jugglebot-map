import type { Task, TaskUpdateBody, TaskUpdateConflict } from '../../api/schemas';

/**
 * Build the ConflictDialog's payload from a 409 body. The map server answers
 * `{detail: "Task was modified", current: <Task>}`; the prototype shape
 * (`current_updated_at` + `conflicts`) is accepted too. Anything else is not
 * an edit conflict (e.g. "Pathway still has live plans") and returns null.
 */
export function parseConflict(body: unknown, pending: TaskUpdateBody): TaskUpdateConflict | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.current_updated_at === 'string' && typeof b.conflicts === 'object') {
    return body as TaskUpdateConflict;
  }
  const current = b.current as Task | undefined;
  if (typeof current !== 'object' || current === null || typeof current.updated_at !== 'string') {
    return null;
  }
  const conflicts: TaskUpdateConflict['conflicts'] = {};
  for (const [k, v] of Object.entries(pending)) {
    if (k === 'if_unchanged_since') continue;
    const server = (current as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(server) !== JSON.stringify(v)) conflicts[k] = { client: v, server };
  }
  return {
    detail: String(b.detail ?? 'Task was modified'),
    current_updated_at: current.updated_at,
    current_updated_by: current.updated_by,
    conflicts,
  };
}
