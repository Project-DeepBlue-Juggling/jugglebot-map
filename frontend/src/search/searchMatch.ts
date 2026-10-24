import type { Task } from '../api/schemas';
import { byTitle } from '../tasks/itemTree';

/**
 * Pure matching for the global task search (ADR 0044). Title-only,
 * case-insensitive substring — the same rule the dependency `<TaskPicker>`
 * uses — so the toolbar, the match set, and the in-view highlight all agree.
 */

/** Trimmed + lower-cased query, the canonical form used for matching. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Tasks whose `title` contains the query as a case-insensitive substring,
 * sorted by title for a stable results menu. A blank/whitespace query matches
 * nothing (no highlight, no dropdown) rather than everything.
 */
export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  const q = normalizeQuery(query);
  if (q === '') return [];
  return tasks.filter((t) => t.title.toLowerCase().includes(q)).sort(byTitle);
}
