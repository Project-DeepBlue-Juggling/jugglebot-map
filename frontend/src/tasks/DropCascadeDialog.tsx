import { useEffect, useRef } from 'react';

/**
 * ADR 0075 §11: shown when a task with open sub-tasks is about to be dropped.
 * It names what would go and offers three ways out — drop the branch, drop
 * just this task, or write nothing.
 *
 * Structure mirrors CompletionReminderDialog / ConflictDialog (role="dialog"
 * aria-modal, backdrop-click + Esc to cancel), so it participates in the same
 * `modalIsOpen()` Esc-deferral other handlers key off.
 *
 * The sub-tasks are listed rather than merely counted: the cascade is a bulk
 * write with no grouped undo behind it (ADR 0018's undo is per action), so
 * the user should see what they are about to abandon.
 */
interface Props {
  /** The task being dropped. */
  title: string;
  /** The open sub-tasks a cascade would drop (already known non-empty). */
  openDescendants: readonly { title: string }[];
  onCascade: () => void;
  onOnly: () => void;
  onCancel: () => void;
}

const PREVIEW_LIMIT = 8;

export default function DropCascadeDialog({
  title,
  openDescendants,
  onCascade,
  onOnly,
  onCancel,
}: Props) {
  const cascadeRef = useRef<HTMLButtonElement>(null);
  const count = openDescendants.length;
  const shown = openDescendants.slice(0, PREVIEW_LIMIT);
  const overflow = count - shown.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Focus the primary action so Enter drops the branch (no autoFocus prop —
  // jsx-a11y).
  useEffect(() => {
    cascadeRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drop-cascade-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800">
        <h2
          id="drop-cascade-heading"
          className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Drop the sub-tasks too?
        </h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-800 dark:text-slate-200">{title}</span> has{' '}
          {count === 1 ? 'one sub-task' : `${count} sub-tasks`} still open:
        </p>
        <ul className="mb-4 max-h-60 overflow-y-auto rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {shown.map((t, i) => (
            <li key={i} className="truncate py-0.5">
              {t.title}
            </li>
          ))}
          {overflow > 0 && (
            <li className="py-0.5 italic text-slate-500 dark:text-slate-400">
              and {overflow} more
            </li>
          )}
        </ul>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Completed sub-tasks are left as they are. Each task is dropped separately, so undo steps
          back through them one at a time.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onOnly}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            Drop this task only
          </button>
          <button
            ref={cascadeRef}
            type="button"
            onClick={onCascade}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Drop task and {count === 1 ? 'sub-task' : `${count} sub-tasks`}
          </button>
        </div>
      </div>
    </div>
  );
}
