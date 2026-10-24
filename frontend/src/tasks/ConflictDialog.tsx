import { useEffect } from 'react';
import type { TaskUpdateConflict, User } from '../api/schemas';
import { STATUS_LABELS } from './statusLabels';

/**
 * Phase 4 conflict-warning dialog (ADR 0004).
 *
 * Renders the per-field client-vs-server diff carried in the 409 body
 * from `PATCH /tasks/{id}` and offers two paths out:
 *
 * - **Overwrite** re-PATCHes with `if_unchanged_since:
 *   <conflict.current_updated_at>`, applying the user's pending values
 *   on top of the now-canonical server state. Last-write-wins is the
 *   stated v1 contract; the audit log preserves what was overwritten.
 * - **Cancel** dismisses the dialog and drops local edits; the next
 *   detail-panel render will pick up the server's row.
 *
 * Wording is deliberately not locked in this component — the §5
 * checkpoint asks the user to drive it live and sign off. Keep all
 * user-visible strings in this one file so the iteration is local.
 */

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  completion_criteria: 'Completion Criteria',
  kind: 'Kind',
  status: 'Status',
  parent_id: 'Parent task',
  assignee_ids: 'Assignees',
  reviewer_id: 'Reviewer',
  color: 'Colour',
  canvas_x: 'Canvas X',
  canvas_y: 'Canvas Y',
  canvas_collapsed: 'Canvas collapsed',
  due_date: 'Due date',
};

interface Props {
  conflict: TaskUpdateConflict;
  users: User[];
  parentLookup: Map<string, string>; // task id → title, for parent_id rendering
  onOverwrite: () => void;
  onCancel: () => void;
  busy: boolean;
}

export default function ConflictDialog({
  conflict,
  users,
  parentLookup,
  onOverwrite,
  onCancel,
  busy,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const otherUser = users.find((u) => u.id === conflict.current_updated_by);
  const otherUserLabel = otherUser?.display_name ?? 'Another user';
  const fieldEntries = Object.entries(conflict.conflicts);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800">
        <h2
          id="conflict-heading"
          className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {otherUserLabel} also edited this task
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Their changes were saved while you had this open. Review the differences below, then
          choose to keep your edits (overwriting theirs) or discard yours.
        </p>

        {fieldEntries.length === 0 ? (
          <p className="mb-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            They edited fields you didn&rsquo;t touch. Saving on top is safe; cancelling discards
            your pending edits.
          </p>
        ) : (
          <div className="mb-4 max-h-80 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-1/4 px-3 py-2 text-left font-medium">Field</th>
                  <th className="w-3/8 px-3 py-2 text-left font-medium">Your value</th>
                  <th className="w-3/8 px-3 py-2 text-left font-medium">{otherUserLabel}</th>
                </tr>
              </thead>
              <tbody>
                {fieldEntries.map(([field, pair]) => (
                  <tr
                    key={field}
                    className="border-t border-slate-200 align-top dark:border-slate-700"
                  >
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                      {FIELD_LABELS[field] ?? field}
                    </td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                      {renderValue(field, pair.client, users, parentLookup)}
                    </td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                      {renderValue(field, pair.server, users, parentLookup)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            Cancel and discard my edits
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            disabled={busy}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? 'Saving…' : 'Overwrite with my edits'}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderValue(
  field: string,
  value: unknown,
  users: User[],
  parentLookup: Map<string, string>,
): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="italic text-slate-400 dark:text-slate-500">— empty —</span>;
  }
  if (field === 'status' && typeof value === 'string' && value in STATUS_LABELS) {
    return STATUS_LABELS[value as keyof typeof STATUS_LABELS];
  }
  if (field === 'assignee_ids' && Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="italic text-slate-400 dark:text-slate-500">— unassigned —</span>;
    }
    const names = value
      .map((id) =>
        typeof id === 'string' ? (users.find((u) => u.id === id)?.display_name ?? id) : String(id),
      )
      .join(', ');
    return names;
  }
  if (field === 'parent_id' && typeof value === 'string') {
    return parentLookup.get(value) ?? value;
  }
  // ADR 0058: resolve the reviewer's id to a display name, like assignees.
  if (field === 'reviewer_id' && typeof value === 'string') {
    return users.find((u) => u.id === value)?.display_name ?? value;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
