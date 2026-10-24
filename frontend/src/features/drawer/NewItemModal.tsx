import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateTask, useTasks } from '../../api/hooks';
import type { TaskCreateBody, TaskPriority } from '../../api/schemas';
import { PRIORITY_LABELS, PRIORITY_OPTIONS } from '../../tasks/priority';
import { KIND_LABELS } from '../../theme/palette';
import { useToast } from '../../ui/useToast';

/** Kinds a person can file from the app; plans and phases come from plan files. */
const NEW_ITEM_KINDS = ['bug', 'feature', 'idea'] as const;

const FIELD =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';
const LABEL = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

/**
 * The new-item modal: five fields (kind, title, one line, priority, pathway).
 * One column at every width (no responsive breakpoints), `w-full max-w-md` plus a
 * viewport-bounded scrolling body, so it fits a 400 px window.
 */
export default function NewItemModal({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { data: tasks = [] } = useTasks();
  const toast = useToast();
  const [kind, setKind] = useState<string>('idea');
  const [title, setTitle] = useState('');
  const [line, setLine] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [pathway, setPathway] = useState('');
  const pathways = tasks.filter((t) => t.kind === 'pathway');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim() === '') return;
    const body: TaskCreateBody = { kind, title: title.trim(), description: line.trim() };
    body.priority = priority === '' ? null : priority;
    if (pathway !== '') body.parent_id = pathway;
    try {
      await create.mutateAsync(body);
      onClose();
    } catch (err) {
      toast.error('Could not file the item', err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New item"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        data-testid="new-item-form"
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-800"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New item</h2>
        <div>
          <label className={LABEL} htmlFor="new-kind">
            Kind
          </label>
          <select
            id="new-kind"
            className={FIELD}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {NEW_ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="new-title">
            Title
          </label>
          <input
            id="new-title"
            autoFocus
            className={FIELD}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="new-line">
            One line
          </label>
          <input
            id="new-line"
            className={FIELD}
            value={line}
            onChange={(e) => setLine(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="new-priority">
            Priority (optional)
          </label>
          <select
            id="new-priority"
            className={FIELD}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
          >
            <option value="">None</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="new-pathway">
            Pathway (optional)
          </label>
          <select
            id="new-pathway"
            className={FIELD}
            value={pathway}
            onChange={(e) => setPathway(e.target.value)}
          >
            <option value="">Unattached</option>
            {pathways.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={title.trim() === '' || create.isPending}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
