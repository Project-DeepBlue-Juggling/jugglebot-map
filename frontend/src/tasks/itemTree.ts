import type { Task } from '../api/schemas';

/**
 * One row of a flattened task tree (ADR 0039). `depth` is the distance from
 * a root (0 for roots / orphans); `hasChildren` is true when this task is a
 * parent of at least one task in the same input set. Both the searchable
 * `<TaskPicker>` (indentation) and the always-tree List view (row order +
 * indentation + disclosure triangles) consume this shape so the two surfaces
 * agree on what "the tree" is.
 */
export interface ItemTreeRow {
  task: Task;
  depth: number;
  hasChildren: boolean;
}

/** Comparator over two tasks, applied within each sibling group. */
export type SiblingComparator = (a: Task, b: Task) => number;

/** Default sibling order: case-insensitive, locale-aware by title. Stable
 *  enough for the picker; the List passes its active column comparator. */
export const byTitle: SiblingComparator = (a, b) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/**
 * Depth-first **pre-order** flattening of the `parent_id` forest (ADR 0039).
 *
 * Roots come first (every task whose `parent_id` is null, or whose parent is
 * not present in `tasks` — an "orphan", which happens when a filter hides the
 * parent but keeps a child). Each root is immediately followed by its subtree.
 * Siblings — including the roots themselves — are ordered by `compare`.
 *
 * Cycle-defensive: a `parent_id` loop (which the backend forbids, but which a
 * race could momentarily surface) is broken by a visited-set so the walk
 * terminates and each task appears at most once. Mirrors the seen-set guard in
 * `descendantSet` / `ancestorsOf`.
 *
 * O(V log V) for the per-group sorts at v1 scale (≤ a few hundred tasks);
 * structure is O(V + E).
 */
export function flattenItemTree(
  tasks: readonly Task[],
  compare: SiblingComparator = byTitle,
): ItemTreeRow[] {
  const present = new Set(tasks.map((t) => t.id));

  // Bucket children under their parent id. A task counts as a child only when
  // its parent is also in the visible set; otherwise it is treated as a root
  // below (orphan promotion).
  const childrenByParent = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    const parentId = t.parent_id;
    if (parentId === null || !present.has(parentId)) {
      roots.push(t);
      continue;
    }
    const bucket = childrenByParent.get(parentId);
    if (bucket === undefined) childrenByParent.set(parentId, [t]);
    else bucket.push(t);
  }

  const rows: ItemTreeRow[] = [];
  const visited = new Set<string>();

  const walk = (task: Task, depth: number): void => {
    if (visited.has(task.id)) return; // cycle / diamond guard
    visited.add(task.id);
    const children = childrenByParent.get(task.id);
    rows.push({ task, depth, hasChildren: children !== undefined && children.length > 0 });
    if (children === undefined) return;
    for (const child of [...children].sort(compare)) walk(child, depth + 1);
  };

  for (const root of [...roots].sort(compare)) walk(root, 0);

  // Defensive: any task left unvisited only because it was stranded inside a
  // pure cycle (no acyclic path from a root) still gets surfaced as a depth-0
  // row so it never silently vanishes from a list the user expects to be
  // complete. Unreachable under the backend's cycle ban; cheap insurance.
  if (visited.size !== tasks.length) {
    for (const t of tasks) {
      if (!visited.has(t.id)) {
        visited.add(t.id);
        const children = childrenByParent.get(t.id);
        rows.push({
          task: t,
          depth: 0,
          hasChildren: children !== undefined && children.length > 0,
        });
      }
    }
  }

  return rows;
}

/**
 * Lineage breadcrumb for a task: the titles of its ancestors from the
 * outermost root down to (but not including) the task itself, e.g.
 * `['Hardware', 'Tester board']` for a task `Probe rig` nested under them.
 * Used by `<TaskPicker>` to disambiguate search matches that are otherwise
 * identically titled and to keep a filtered match in spatial context (ADR
 * 0039). Cycle-safe via a visited-set; returns `[]` for a root.
 */
export function lineageOf(taskId: string, tasks: readonly Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const chain: string[] = [];
  const visited = new Set<string>([taskId]);
  let current = byId.get(taskId)?.parent_id ?? null;
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const parent = byId.get(current);
    if (parent === undefined) break; // parent outside the set — stop the chain
    chain.push(parent.title);
    current = parent.parent_id;
  }
  return chain.reverse();
}

/** Descendant set used by the drag-to-reparent cycle guard (Phase 5.8 /
 *  ADR 0029). Returns every task id reachable from `rootId` along
 *  `parent_id → children` edges, **including `rootId` itself**. A drop
 *  on any task in this set would close (or be) a `parent_id` loop, so
 *  the canvas refuses the connection at drop time.
 *
 *  Different traversal direction from `forwardReachability`: that one
 *  walks `blocker_id → blocked_id` along `dependencies`; this one walks
 *  `parent_id → children` along `tasks`. O(V + E) over the children
 *  graph; cheap at v1 scale. */
export function descendantSet(rootId: string, tasks: readonly Task[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parent_id === null) continue;
    const arr = children.get(t.parent_id);
    if (arr === undefined) children.set(t.parent_id, [t.id]);
    else arr.push(t.id);
  }
  const reached = new Set<string>([rootId]);
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    const next = children.get(node);
    if (next === undefined) continue;
    for (const n of next) {
      if (reached.has(n)) continue;
      reached.add(n);
      stack.push(n);
    }
  }
  return reached;
}
