import { useMemo } from 'react';
import { ApiError } from '../api/client';
import { useCreateDependency, useDeleteDependency } from '../api/hooks';
import type { DependencyEdge, Task, TaskDetail } from '../api/schemas';
import { useToast } from '../ui/useToast';
import TaskPicker from './TaskPicker';

interface Props {
  task: TaskDetail;
  allTasks: Task[];
}

// Both lists rendered with the same shape — only the resolved title comes
// from a different end of each edge.
interface RowProps {
  edgeId: string;
  title: string;
  busy: boolean;
  onRemove: () => void;
}

function DependencyRow({ edgeId, title, busy, onRemove }: RowProps) {
  return (
    <li
      key={edgeId}
      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700"
    >
      <span className="truncate" title={title}>
        {title}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${title}`}
        className="ml-2 rounded px-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-100"
      >
        ×
      </button>
    </li>
  );
}

export default function TaskDependenciesSection({ task, allTasks }: Props) {
  const create = useCreateDependency();
  const del = useDeleteDependency();
  const toast = useToast();

  const taskTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTasks) map.set(t.id, t.title);
    return map;
  }, [allTasks]);

  // The set of task ids already involved in any edge with this task — to
  // hide them from the add-dropdowns and avoid attempts that the backend
  // would 409 as duplicates.
  const blockingIds = useMemo(
    () => new Set(task.blocking.map((e) => e.blocked_id)),
    [task.blocking],
  );
  const blockedByIds = useMemo(
    () => new Set(task.blocked_by.map((e) => e.blocker_id)),
    [task.blocked_by],
  );

  // Exclude the task itself and anything already linked in this direction
  // from each picker (the backend would 409 on self-edge / duplicate).
  const excludeForBlocking = useMemo(
    () => new Set<string>([task.id, ...blockingIds]),
    [task.id, blockingIds],
  );
  const excludeForBlockedBy = useMemo(
    () => new Set<string>([task.id, ...blockedByIds]),
    [task.id, blockedByIds],
  );

  const handleCreate = async (blockerId: string, blockedId: string) => {
    try {
      await create.mutateAsync({ blocker_id: blockerId, blocked_id: blockedId });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const detail = String((err.body as { detail?: unknown } | null)?.detail ?? err.message);
        if (detail.toLowerCase().includes('cycle')) {
          toast.error(
            'Adding this dependency would create a cycle',
            'A → B and B → A is not allowed.',
          );
          return;
        }
        toast.error('Dependency already exists', detail);
        return;
      }
      toast.error('Could not add dependency', err instanceof ApiError ? err.message : String(err));
    }
  };

  const handleDelete = async (edge: DependencyEdge) => {
    const blockerTitle = taskTitle.get(edge.blocker_id) ?? 'Unknown';
    const blockedTitle = taskTitle.get(edge.blocked_id) ?? 'Unknown';
    try {
      await del.mutateAsync({
        id: edge.id,
        blockerId: edge.blocker_id,
        blockedId: edge.blocked_id,
      });
      // Undo path (ADR 0018). Re-POST creates a new edge with a new UUID
      // between the same two tasks; functionally identical to the deleted
      // one. A 409 on undo means the server now sees the inverse as a
      // cycle (some other dependency was added meanwhile) or as a
      // duplicate (re-created in another tab) — surface either way.
      toast.info('Dependency removed', `${blockerTitle} → ${blockedTitle}`, {
        action: {
          label: 'Undo',
          handler: async () => {
            try {
              await create.mutateAsync({
                blocker_id: edge.blocker_id,
                blocked_id: edge.blocked_id,
              });
              toast.success('Dependency restored', `${blockerTitle} → ${blockedTitle}`);
            } catch (err) {
              if (err instanceof ApiError && err.status === 409) {
                const detail = String(
                  (err.body as { detail?: unknown } | null)?.detail ?? err.message,
                );
                if (detail.toLowerCase().includes('cycle')) {
                  toast.error(
                    'Could not restore dependency',
                    'A cycle would form — another edge was added since you removed this one.',
                  );
                  return;
                }
                toast.error('Could not restore dependency', detail);
                return;
              }
              toast.error(
                'Could not restore dependency',
                err instanceof ApiError ? err.message : String(err),
              );
            }
          },
        },
      });
    } catch (err) {
      toast.error(
        'Could not remove dependency',
        err instanceof ApiError ? err.message : String(err),
      );
    }
  };

  const busy = create.isPending || del.isPending;

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-700">
      <legend className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Dependencies
      </legend>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Blocking ({task.blocking.length})
          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
            — tasks this one blocks
          </span>
        </p>
        {task.blocking.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">None</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {task.blocking.map((e) => (
              <DependencyRow
                key={e.id}
                edgeId={e.id}
                title={taskTitle.get(e.blocked_id) ?? e.blocked_id}
                busy={busy}
                onRemove={() => void handleDelete(e)}
              />
            ))}
          </ul>
        )}
        {/* Picking a task adds the edge immediately; resetOnSelect keeps the
            picker on its placeholder, ready for the next pick — the
            chip-input pattern, now searchable + indented (ADR 0039). */}
        <div className="mt-2">
          <TaskPicker
            tasks={allTasks}
            value={null}
            onChange={(id) => {
              if (id !== null) void handleCreate(task.id, id);
            }}
            ariaLabel="Add task this one will block"
            excludeIds={excludeForBlocking}
            noneLabel="— select a task —"
            allowNone={false}
            resetOnSelect
            disabled={busy}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Blocked by ({task.blocked_by.length})
          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
            — tasks that block this one
          </span>
        </p>
        {task.blocked_by.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">None</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {task.blocked_by.map((e) => (
              <DependencyRow
                key={e.id}
                edgeId={e.id}
                title={taskTitle.get(e.blocker_id) ?? e.blocker_id}
                busy={busy}
                onRemove={() => void handleDelete(e)}
              />
            ))}
          </ul>
        )}
        <div className="mt-2">
          <TaskPicker
            tasks={allTasks}
            value={null}
            onChange={(id) => {
              if (id !== null) void handleCreate(id, task.id);
            }}
            ariaLabel="Add task that blocks this one"
            excludeIds={excludeForBlockedBy}
            noneLabel="— select a task —"
            allowNone={false}
            resetOnSelect
            disabled={busy}
          />
        </div>
      </div>
    </fieldset>
  );
}
