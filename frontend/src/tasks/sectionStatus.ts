import type { Task, TaskStatus } from '../api/schemas';

/**
 * Inferred status for "section" nodes (ADR 0048, issue #84).
 *
 * A section is a grouping placeholder, not a real task: its status is
 * derived from the work beneath it rather than set by hand. The derivation
 * lives on the client — the backend only stores the `is_section` flag and
 * the preserved manual `status` — because a child's status change never
 * touches its parent's row, so any client must recompute from children
 * between SSE events regardless. Computing it here is the single source of
 * truth and is reactive by construction (re-runs whenever the task list
 * changes).
 *
 * The rule is "progress-aware, blocked & QA hidden" (ADR 0048, extended by
 * ADR 0052 for the `backlog` / `qa` statuses and by ADR 0075 for `dropped`):
 *
 *   - no children                       → not_started   (an empty section)
 *   - every child dropped               → dropped
 *   - (dropped children are then discarded, and the rest decide:)
 *   - all children complete             → complete
 *   - all children backlog              → backlog
 *   - all children backlog/not_started  → not_started
 *   - otherwise                         → in_progress
 *
 * A child's `blocked` *and* `qa` are mapped to `in_progress` *before*
 * aggregating, so neither a blocked nor an in-review leaf surfaces as a
 * blocked/QA section — both are leaf-level, mid-flight concerns. The rule is
 * recursive: a child section contributes
 * its own rolled-up status, so the rollup covers the entire subtree. It
 * reads the parent tree only; the dependency graph is ignored.
 */

/**
 * Pure rollup over a list of *already-effective* child statuses. Separated
 * from the tree walk so the rule itself is trivially testable against the
 * ADR's truth table.
 */
export function rollUpStatus(childStatuses: readonly TaskStatus[]): TaskStatus {
  if (childStatuses.length === 0) return 'not_started';
  // ADR 0075: a dropped child leaves the count *entirely* — it is discarded
  // rather than normalised to something else the way blocked/qa are below.
  // Abandoned work should make the figure above it more honest, not less: the
  // alternatives either inflate it (count it as done) or put 100% permanently
  // out of reach (count it as outstanding).
  const live = childStatuses.filter((s) => s !== 'dropped');
  // Every child was dropped, so the section was abandoned with them. Stated as
  // its own case because filtering leaves an empty list here, and the empty
  // list already means something else above (a section with no children).
  if (live.length === 0) return 'dropped';
  // Blocked and QA are both mid-flight — hidden at the section level by
  // counting them as in-progress before aggregating (ADR 0052).
  const normalised: TaskStatus[] = live.map((s) =>
    s === 'blocked' || s === 'qa' ? 'in_progress' : s,
  );
  if (normalised.every((s) => s === 'complete')) return 'complete';
  // All parked → backlog; a mix of the two not-yet-started buckets
  // (backlog + not_started) reads as not_started.
  if (normalised.every((s) => s === 'backlog')) return 'backlog';
  if (normalised.every((s) => s === 'backlog' || s === 'not_started')) return 'not_started';
  return 'in_progress';
}

/**
 * Resolve every task id to the status it should *display*: a real task's own
 * `status`, and a section's status rolled up recursively from its
 * descendants. One bottom-up pass with memoisation, so a deep tree costs
 * O(N), not O(N·depth).
 *
 * The map contains an entry for every task in `tasks` (sections and real
 * tasks alike), so callers render with `index.get(t.id) ?? t.status` — the
 * fallback guards a task that somehow isn't in the index (it isn't, in
 * practice, but never trust the graph).
 */
export function buildEffectiveStatusIndex(tasks: readonly Task[]): Map<string, TaskStatus> {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parent_id === null) continue;
    const arr = childrenOf.get(t.parent_id);
    if (arr === undefined) childrenOf.set(t.parent_id, [t.id]);
    else arr.push(t.id);
  }

  const cache = new Map<string, TaskStatus>();
  const visiting = new Set<string>();

  const resolve = (id: string): TaskStatus => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const task = taskById.get(id);
    // Unknown id (e.g. a child pointing at a missing parent): treat as a
    // plain not_started so a malformed graph can't crash the walk.
    if (task === undefined) return 'not_started';
    if (!task.is_section) {
      cache.set(id, task.status);
      return task.status;
    }
    // The server enforces parent_id acyclicity (ADR 0029), but a re-entrant
    // visit means the graph is malformed — bail to not_started rather than
    // recurse forever.
    if (visiting.has(id)) return 'not_started';
    visiting.add(id);
    const childStatuses = (childrenOf.get(id) ?? []).map(resolve);
    visiting.delete(id);
    const rolled = rollUpStatus(childStatuses);
    cache.set(id, rolled);
    return rolled;
  };

  for (const t of tasks) resolve(t.id);
  return cache;
}

/**
 * The status a task should display, given a prebuilt effective-status index.
 * A thin, intention-revealing accessor over the map.
 */
export function effectiveStatusOf(task: Task, index: ReadonlyMap<string, TaskStatus>): TaskStatus {
  return index.get(task.id) ?? task.status;
}

/** One direct child of a section, as a coloured segment in its progress bar
 *  (ADR 0048 amendment). `status` is the child's *effective* status — a
 *  sub-section contributes its own rolled-up status, so one child = one
 *  segment regardless of depth. */
export interface ChildSegment {
  id: string;
  title: string;
  status: TaskStatus;
}

/**
 * Map each parent id to its direct children as {@link ChildSegment}s (in the
 * task list's natural order), each carrying its effective status. Built once
 * over the full task list and a prebuilt effective-status index; the
 * SectionProgressBar then renders the relevant parent's segments. Parents with
 * no children simply don't appear in the map.
 */
export function buildChildSegmentIndex(
  tasks: readonly Task[],
  statusIndex: ReadonlyMap<string, TaskStatus>,
): Map<string, ChildSegment[]> {
  const byParent = new Map<string, ChildSegment[]>();
  for (const t of tasks) {
    if (t.parent_id === null) continue;
    const seg: ChildSegment = {
      id: t.id,
      title: t.title,
      status: statusIndex.get(t.id) ?? t.status,
    };
    const arr = byParent.get(t.parent_id);
    if (arr === undefined) byParent.set(t.parent_id, [seg]);
    else arr.push(seg);
  }
  return byParent;
}
