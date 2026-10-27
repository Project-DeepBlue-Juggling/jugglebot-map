import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { ApiError } from '../../api/client';
import { useCreateTask, useTasks } from '../../api/hooks';
import type { TaskCreateBody, TaskPriority } from '../../api/schemas';
import { PRIORITY_LABELS, PRIORITY_OPTIONS, PRIORITY_STYLES } from '../../tasks/priority';
import { KIND_LABELS, kindHue } from '../../theme/palette';
import { useToast } from '../../ui/useToast';

/** Kinds a person can file from the app; plans and phases come from plan files. */
const NEW_ITEM_KINDS = ['idea', 'feature', 'bug'] as const;

const FIELD =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';
const LABEL = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';
const UNCHOSEN =
  'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700';

/**
 * One choice as a row of pill buttons (owner, 2026-10-27, JB-71). Native radios
 * under the pills keep the keyboard behaviour: Tab lands on the chosen pill, the
 * arrow keys move and choose, Tab moves on.
 */
function Pills<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  text,
  tone,
  autoFocus = false,
}: {
  id: string;
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  text: (v: T) => string;
  /** Classes for the chosen pill. */
  tone: (v: T) => string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <span id={`${id}-label`} className={LABEL}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="radio"
              name={id}
              value={o}
              checked={o === value}
              onChange={() => onChange(o)}
              autoFocus={autoFocus && o === value}
              className="peer sr-only"
            />
            <span
              className={clsx(
                'inline-block rounded-full border px-3 py-1 text-sm',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-1 dark:peer-focus-visible:ring-offset-slate-800',
                o === value ? clsx('border-transparent font-medium', tone(o)) : UNCHOSEN,
              )}
            >
              {text(o)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

const PRIORITY_PILLS = ['', ...PRIORITY_OPTIONS] as const;

/**
 * The new-item modal: five fields (kind, title, one line, priority, pathway).
 * Kind and Priority are pill buttons; the form opens on the Kind pills.
 * One column at every width (no responsive breakpoints), `w-full max-w-md` plus a
 * viewport-bounded scrolling body, so it fits a 400 px window.
 */
export default function NewItemModal({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { data: tasks = [] } = useTasks();
  const toast = useToast();
  const [kind, setKind] = useState<(typeof NEW_ITEM_KINDS)[number]>('idea');
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
        <Pills
          id="new-kind"
          label="Kind"
          options={NEW_ITEM_KINDS}
          value={kind}
          onChange={setKind}
          text={(k) => KIND_LABELS[k] ?? k}
          tone={(k) => kindHue(k).chip}
          autoFocus
        />
        <div>
          <label className={LABEL} htmlFor="new-title">
            Title
          </label>
          <input
            id="new-title"
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
        <Pills
          id="new-priority"
          label="Priority (optional)"
          options={PRIORITY_PILLS}
          value={priority}
          onChange={setPriority}
          text={(p) => (p === '' ? 'None' : PRIORITY_LABELS[p])}
          tone={(p) =>
            p === ''
              ? 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100'
              : clsx(PRIORITY_STYLES[p].pillBg, PRIORITY_STYLES[p].pillText)
          }
        />
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
