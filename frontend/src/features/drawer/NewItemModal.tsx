import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import clsx from 'clsx';
import { ApiError } from '../../api/client';
import { useCreateTask, useTasks } from '../../api/hooks';
import type { TaskCreateBody, TaskPriority } from '../../api/schemas';
import { PRIORITY_LABELS, PRIORITY_OPTIONS, PRIORITY_STYLES } from '../../tasks/priority';
import { KIND_LABELS, kindHue } from '../../theme/palette';
import { LABEL, Pills } from '../../ui/Pills';
import { METRIC_ENUMS, METRIC_LABELS } from '../../lib/metrics';
import { isSubmitChord } from '../../ui/keyboard';
import { useToast } from '../../ui/useToast';

/** Kinds a person can file from the app; plans and phases come from plan files. */
const NEW_ITEM_KINDS = ['idea', 'feature', 'bug'] as const;

const FIELD =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';
const EFFORT_PILLS = ['', ...METRIC_ENUMS.effort] as const;
const HARDWARE_PILLS = ['', ...METRIC_ENUMS.hardware] as const;
const NEUTRAL_PILL = 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100';

const PRIORITY_PILLS = ['', ...PRIORITY_OPTIONS] as const;

/**
 * The new-item modal: seven fields (kind, title, one line, priority, effort, hardware, pathway).
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
  const [effort, setEffort] = useState<(typeof EFFORT_PILLS)[number]>('');
  const [hardware, setHardware] = useState<(typeof HARDWARE_PILLS)[number]>('');
  const [pathway, setPathway] = useState('');
  const pathways = tasks.filter((t) => t.kind === 'pathway');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // One request at a time: a second Ctrl+Enter or click before the first
  // answers must not file the item twice (isPending lags by a render).
  const inFlight = useRef(false);
  const submit = async () => {
    if (title.trim() === '' || inFlight.current) return;
    inFlight.current = true;
    const body: TaskCreateBody = { kind, title: title.trim(), description: line.trim() };
    body.priority = priority === '' ? null : priority;
    if (effort !== '') body.effort = effort;
    if (hardware !== '') body.hardware = hardware;
    if (pathway !== '') body.parent_id = pathway;
    try {
      await create.mutateAsync(body);
      onClose();
    } catch (err) {
      toast.error('Could not file the item', err instanceof ApiError ? err.message : String(err));
    } finally {
      inFlight.current = false;
    }
  };

  // Ctrl+Enter / Cmd+Enter creates from any field (JB-78), as it saves in the
  // drawer. preventDefault stops the browser's own Enter-submit in a text
  // input firing a second time.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    if (!isSubmitChord(e)) return;
    e.preventDefault();
    void submit();
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
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={onKeyDown}
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
        <Pills
          id="new-effort"
          label={`${METRIC_LABELS.effort} (optional)`}
          options={EFFORT_PILLS}
          value={effort}
          onChange={setEffort}
          text={(e) => (e === '' ? 'None' : e)}
          tone={() => NEUTRAL_PILL}
        />
        <Pills
          id="new-hardware"
          label={`${METRIC_LABELS.hardware} (optional)`}
          options={HARDWARE_PILLS}
          value={hardware}
          onChange={setHardware}
          text={(h) => (h === '' ? 'None' : h)}
          tone={() => NEUTRAL_PILL}
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
            title="Create (Ctrl+Enter)"
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
