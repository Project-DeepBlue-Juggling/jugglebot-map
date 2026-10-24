import { useCallback } from 'react';
import type { Task } from '../api/schemas';
import { usePatchTask, useOptimisticTaskPatch } from '../api/hooks';

/**
 * ADR 0075 §14: apply a drop cascade — set `status: 'dropped'` on each task the
 * user agreed to abandon.
 *
 * Deliberately **N sequential PATCHes on the existing single-task write path**
 * rather than a new bulk endpoint: each one carries its own optimistic update,
 * `if_unchanged_since` guard, SSE echo and audit entry, exactly as an inline
 * status change does. No API contract change.
 *
 * The trade, recorded in the ADR: this is **not atomic**. If one child fails
 * the rest still apply, and the result is coherent (some tasks dropped, some
 * not) rather than corrupt — unlike the DELETE-then-POST shape ADR 0064 §7
 * removed, a failure here destroys nothing. The caller reports how many did
 * not land.
 *
 * Each failed task is rolled back individually, so the cache never keeps an
 * optimistic `dropped` the server rejected.
 *
 * Call it **after** the parent's own write has succeeded: if the parent cannot
 * be dropped there is no reason to have dropped the work beneath it.
 */
export function useDropCascadeWrite() {
  const patch = usePatchTask();
  const optimisticPatch = useOptimisticTaskPatch();

  return useCallback(
    async (tasks: readonly Task[]): Promise<{ failed: Task[] }> => {
      const failed: Task[] = [];
      for (const t of tasks) {
        const rollback = optimisticPatch(t.id, { status: 'dropped' });
        try {
          await patch.mutateAsync({
            id: t.id,
            body: { status: 'dropped', if_unchanged_since: t.updated_at },
          });
        } catch {
          // Swallowed per task on purpose: one stale child must not abandon
          // the rest of the cascade. The caller surfaces the tally — which is
          // the only thing the user can act on — rather than one toast per
          // failure.
          rollback();
          failed.push(t);
        }
      }
      return { failed };
    },
    [patch, optimisticPatch],
  );
}
