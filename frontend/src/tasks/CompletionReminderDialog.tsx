import { useEffect, useRef } from 'react';

/**
 * ADR 0060: a non-blocking reminder shown when a task is about to be marked
 * complete. It surfaces the task's completion criteria and lets the user
 * proceed or cancel — it never *prevents* completion, it interposes one
 * confirm step. Structure mirrors ConflictDialog (role="dialog" aria-modal,
 * backdrop-click + Esc to cancel), so it participates in the same
 * `modalIsOpen()` Esc-deferral other handlers key off.
 */
interface Props {
  /** The task's title, for the prompt. */
  title: string;
  /** The completion-criteria text to surface (already known non-empty). */
  criteria: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CompletionReminderDialog({ title, criteria, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Focus the primary action so Enter proceeds (no autoFocus prop — jsx-a11y).
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-reminder-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800">
        <h2
          id="completion-reminder-heading"
          className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Mark task complete?
        </h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Before completing{' '}
          <span className="font-medium text-slate-800 dark:text-slate-200">{title}</span>, check it
          meets its completion criteria:
        </p>
        <blockquote className="mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {criteria}
        </blockquote>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Mark complete
          </button>
        </div>
      </div>
    </div>
  );
}
