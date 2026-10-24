import type { Task, TaskStatus } from '../api/schemas';
import { isSettledStatus } from './statusLabels';

/**
 * ADR 0075 §11-13: decide whether dropping a task should offer to drop the
 * open work beneath it, and which tasks that would be.
 *
 * A pure function, mirroring {@link resolveCompletionReminder} (ADR 0060), so
 * the rule is unit-testable away from the dialog plumbing and the three call
 * sites — the List view, the Backlog view and the detail panel — share one
 * implementation. The board is deliberately not a call site: ADR 0075 §6
 * keeps `dropped` off the board, so a board drag can never produce it.
 *
 * Abandoning a branch of work is the normal shape of this decision. Without
 * the offer, the status gets applied to the parent alone and eleven leaves are
 * left lying in progress under a task nobody is doing.
 */

/** The pending change a drop gesture would apply. `undefined` means the
 *  gesture leaves the status untouched (e.g. a detail-panel save of some other
 *  field), which is never a drop. */
export interface DropChange {
  nextStatus?: TaskStatus | null | undefined;
}

/**
 * The open, real tasks beneath `task` that a cascade would drop.
 *
 * Empty when the change is not a genuine transition *into* `dropped` (already
 * dropped → no-op), or when nothing beneath it is still open. An empty result
 * means "apply the change with no dialog".
 *
 * What it excludes, and why:
 *
 *   - **Already `complete` or `dropped`** — completed work was actually done,
 *     and rewriting it would destroy exactly the record this status exists to
 *     keep. An already-dropped task is a no-op.
 *   - **Sections** — a section has no meaningful stored status (ADR 0048: it
 *     is derived from its children on the client). Once its children are
 *     dropped it rolls up to `dropped` on its own, by ADR 0075 §9. Dropping it
 *     explicitly would write a status nothing reads.
 *
 * The walk covers the **whole subtree**, not just direct children: a branch is
 * abandoned at its root, and the leaves two levels down are exactly the ones a
 * user would otherwise never find again.
 */
export function resolveDropCascade(
  task: Pick<Task, 'id' | 'status'>,
  change: DropChange,
  tasks: readonly Task[],
): Task[] {
  if (change.nextStatus !== 'dropped') return [];
  // Already dropped: re-selecting the same status is not a transition, and
  // must not re-offer to cascade over work the user deliberately left open.
  if (task.status === 'dropped') return [];

  const childrenOf = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id === null) continue;
    const arr = childrenOf.get(t.parent_id);
    if (arr === undefined) childrenOf.set(t.parent_id, [t]);
    else arr.push(t);
  }

  const open: Task[] = [];
  const seen = new Set<string>([task.id]);
  // Iterative walk. The server enforces parent_id acyclicity (ADR 0029), but
  // `seen` keeps a malformed graph from looping here regardless — the same
  // defensive stance buildEffectiveStatusIndex takes.
  const queue: string[] = [task.id];
  while (queue.length > 0) {
    // The queue is non-empty, so shift() cannot be undefined.
    const id = queue.shift() as string;
    for (const child of childrenOf.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      queue.push(child.id);
      if (child.is_section) continue;
      if (isSettledStatus(child.status)) continue;
      open.push(child);
    }
  }
  return open;
}
