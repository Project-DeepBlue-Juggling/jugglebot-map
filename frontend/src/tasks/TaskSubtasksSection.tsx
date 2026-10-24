import { useMemo } from 'react';
import type { Task } from '../api/schemas';
import { buildEffectiveStatusIndex, effectiveStatusOf } from './sectionStatus';
import { STATUS_LABELS } from './statusLabels';

interface Props {
  taskId: string;
  allTasks: Task[];
  /** Open a sub-task in the panel. Omitted where the host can't switch the
   *  panel to another task (My tasks), and the rows render as plain text. */
  onOpenTask?: ((taskId: string) => void) | undefined;
  onAddSubtask: () => void;
}

/**
 * The task's direct children plus "+ Add sub-task" (ADR 0084). Live, like
 * the dependency editor beside it: nothing here is part of the form save.
 */
export default function TaskSubtasksSection({ taskId, allTasks, onOpenTask, onAddSubtask }: Props) {
  // Canvas reading order — row by row, then left to right — which is how
  // `findChildPosition` lays new children out beneath their parent.
  const children = useMemo(
    () =>
      allTasks
        .filter((t) => t.parent_id === taskId)
        .sort((a, b) => a.canvas_y - b.canvas_y || a.canvas_x - b.canvas_x),
    [allTasks, taskId],
  );
  // A child section shows its inferred status (ADR 0048), not its stored one.
  const statusIndex = useMemo(() => buildEffectiveStatusIndex(allTasks), [allTasks]);

  return (
    <fieldset className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-700">
      <legend className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Sub-tasks ({children.length})
      </legend>
      {children.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">None</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Sub-tasks">
          {children.map((child) => {
            const status = STATUS_LABELS[effectiveStatusOf(child, statusIndex)];
            const body = (
              <>
                <span className="truncate">{child.title}</span>
                <span className="ml-2 flex-shrink-0 text-slate-500 dark:text-slate-400">
                  {status}
                </span>
              </>
            );
            const rowClass =
              'flex w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs dark:border-slate-600 dark:bg-slate-700';
            return (
              <li key={child.id} title={child.title}>
                {onOpenTask === undefined ? (
                  <div className={rowClass}>{body}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenTask(child.id)}
                    aria-label={`Open ${child.title}`}
                    className={`${rowClass} hover:bg-slate-100 dark:hover:bg-slate-600`}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onAddSubtask}
        className="self-start rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      >
        + Add sub-task
      </button>
    </fieldset>
  );
}
