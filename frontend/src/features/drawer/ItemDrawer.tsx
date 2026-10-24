import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ApiError } from '../../api/client';
import { useDependencies, usePatchTask, useTask, useTasks, useUsers } from '../../api/hooks';
import type {
  Task,
  TaskDetail,
  TaskPriority,
  TaskUpdateBody,
  TaskUpdateConflict,
  User,
} from '../../api/schemas';
import {
  buildIndex,
  displayTitle,
  INBOX_KINDS,
  nextStop,
  phasesOf,
  phaseSummary,
  plansOf,
  type MapIndex,
} from '../../lib/derive';
import ConflictDialog from '../../tasks/ConflictDialog';
import TaskDependenciesSection from '../../tasks/TaskDependenciesSection';
import { PRIORITY_LABELS, PRIORITY_OPTIONS } from '../../tasks/priority';
import { KIND_LABELS, STATUSES_BY_KIND, statusLabel } from '../../theme/palette';
import { useToast } from '../../ui/useToast';
import { parseConflict } from './conflict';

interface DrawerProps {
  taskId: string;
  onClose: () => void;
  onOpen: (taskId: string) => void;
}

const FIELD =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';
const LABEL = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

/**
 * The one shared drawer. Per kind: pathways and inbox items/tickets are edited
 * here; plans and phases are read-only views of their plan file (the server
 * answers 405 to a write). Every PATCH carries `if_unchanged_since`; a 409
 * "Task was modified" raises the ConflictDialog with the server's `current`.
 */
export default function ItemDrawer({ taskId, onClose, onOpen }: DrawerProps) {
  const detail = useTask(taskId);
  const all = useTasks();
  const deps = useDependencies();
  const users = useUsers();
  const task = detail.data;
  const allTasks = all.data;

  const ix = useMemo(
    () => (allTasks === undefined ? null : buildIndex(allTasks, deps.data ?? [], users.data ?? [])),
    [allTasks, deps.data, users.data],
  );

  return (
    <aside
      role="complementary"
      aria-label="Item drawer"
      className="fixed right-0 top-0 z-30 flex h-full w-[28rem] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {task === undefined
            ? 'Loading…'
            : `${KIND_LABELS[task.kind] ?? task.kind} · ${statusLabel(task.status)}`}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {detail.error !== null && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {(detail.error as Error).message}
          </p>
        )}
        {task !== undefined && ix !== null && allTasks !== undefined && (
          <>
            {task.editable ? (
              <EditableBody
                key={task.id}
                task={task}
                ix={ix}
                allTasks={allTasks}
                users={users.data ?? []}
                onOpen={onOpen}
              />
            ) : (
              <ReadOnlyBody task={task} ix={ix} onOpen={onOpen} />
            )}
            <div className="mt-4">
              {task.editable ? (
                // The server refuses a phase as a blocker, so phases are not offered.
                <TaskDependenciesSection
                  task={task}
                  allTasks={allTasks.filter((t) => t.kind !== 'phase')}
                />
              ) : (
                <ReadOnlyDependencies task={task} ix={ix} onOpen={onOpen} />
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function LinkButton({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="text-left text-sm text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
    >
      {displayTitle(task)}
    </button>
  );
}

/** Plans and phases: fields come from the plan file, so nothing here writes. */
function ReadOnlyBody({
  task,
  ix,
  onOpen,
}: {
  task: TaskDetail;
  ix: MapIndex;
  onOpen: (id: string) => void;
}) {
  const parent = task.parent_id === null ? undefined : ix.byId.get(task.parent_id);
  return (
    <div className="flex flex-col gap-3" data-testid="readonly-body">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{task.title}</h3>
      {task.kind === 'phase' && parent !== undefined && (
        <div>
          <span className={LABEL}>Plan</span>
          <LinkButton task={parent} onOpen={onOpen} />
        </div>
      )}
      {task.description !== '' && (
        <div>
          <span className={LABEL}>Summary</span>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {task.kind === 'phase' ? phaseSummary(task) : task.description}
          </p>
        </div>
      )}
      <div>
        <span className={LABEL}>Status</span>
        <span className="text-sm">{statusLabel(task.status)}</span>
      </div>
      {task.kind === 'plan' && (
        <>
          {task.branch !== null && task.branch !== '' && (
            <div>
              <span className={LABEL}>Branch</span>
              <span className="text-sm">{task.branch}</span>
            </div>
          )}
          <div>
            <span className={LABEL}>Phases</span>
            <ul className="flex flex-col gap-1">
              {phasesOf(ix, task).map((ph) => (
                <li key={ph.id} className="flex items-center justify-between gap-2 text-sm">
                  <LinkButton task={ph} onOpen={onOpen} />
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {statusLabel(ph.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div>
        <span className={LABEL}>Plan file</span>
        <span className="break-all text-sm">{task.source_path.split('#')[0]}</span>
      </div>
    </div>
  );
}

/** Plans and phases: edges are written in the plan file, so show them only. */
function ReadOnlyDependencies({
  task,
  ix,
  onOpen,
}: {
  task: TaskDetail;
  ix: MapIndex;
  onOpen: (id: string) => void;
}) {
  const rows = (ids: string[]) =>
    ids.length === 0 ? (
      <p className="text-xs text-slate-400 dark:text-slate-500">None</p>
    ) : (
      <ul className="flex flex-col gap-1">
        {ids.map((id) => {
          const t = ix.byId.get(id);
          return (
            <li key={id}>
              {t === undefined ? (
                <span className="text-sm">{id}</span>
              ) : (
                <LinkButton task={t} onOpen={onOpen} />
              )}
            </li>
          );
        })}
      </ul>
    );
  return (
    <fieldset
      data-testid="readonly-dependencies"
      className="flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-700"
    >
      <legend className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Dependencies
      </legend>
      <div>
        <span className={LABEL}>Blocked by</span>
        {rows(task.blocked_by.map((e) => e.blocker_id))}
      </div>
      <div>
        <span className={LABEL}>Blocks</span>
        {rows(task.blocking.map((e) => e.blocked_id))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Dependencies of plans and phases are edited in the plan file
      </p>
    </fieldset>
  );
}

interface FormState {
  title: string;
  text: string;
  status: string;
  priority: TaskPriority | '';
  branch: string;
  parentId: string;
  links: string[];
  owners: string[];
}

function formOf(task: TaskDetail): FormState {
  return {
    title: task.title,
    text: task.kind === 'pathway' ? task.destination : task.description,
    status: task.status,
    priority: task.priority ?? '',
    branch: task.branch ?? '',
    parentId: task.parent_id ?? '',
    links: task.links,
    owners: task.assignee_ids,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function EditableBody({
  task,
  ix,
  allTasks,
  users,
  onOpen,
}: {
  task: TaskDetail;
  ix: MapIndex;
  allTasks: Task[];
  users: User[];
  onOpen: (id: string) => void;
}) {
  const patch = usePatchTask();
  const toast = useToast();
  const isPathway = task.kind === 'pathway';
  const isInbox = INBOX_KINDS.has(task.kind);
  const isTicket = task.kind === 'ticket';
  const hasLinks = isInbox || isTicket;

  // `baseline` is what the form was last in sync with (mount, last successful
  // save, last clean refetch). The diff is against it, never the live `task`,
  // so an SSE refetch cannot make Save overwrite someone else's change.
  const baseline = useRef<FormState>(formOf(task));
  const [form, setForm] = useState<FormState>(() => formOf(task));
  const formRef = useRef(form);
  formRef.current = form;
  const lastSeen = useRef(task.updated_at);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const { title, text, status, priority, branch, parentId, links, owners } = form;
  const [newLink, setNewLink] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotedTo, setPromotedTo] = useState('');
  const [conflict, setConflict] = useState<{
    c: TaskUpdateConflict;
    pending: TaskUpdateBody;
    snap: FormState;
  } | null>(null);

  // A refetched task re-seeds every field the user has not touched; dirty
  // fields keep the user's value and their old baseline.
  useEffect(() => {
    if (task.updated_at === lastSeen.current) return;
    lastSeen.current = task.updated_at;
    const fresh = formOf(task);
    const cur = formRef.current;
    const next = { ...cur } as Record<string, unknown>;
    const base = { ...baseline.current } as Record<string, unknown>;
    for (const k of Object.keys(fresh) as Array<keyof FormState>) {
      if (sameValue(cur[k], baseline.current[k])) {
        next[k] = fresh[k];
        base[k] = fresh[k];
      }
    }
    baseline.current = base as unknown as FormState;
    setForm(next as unknown as FormState);
  }, [task]);

  const pathways = useMemo(() => allTasks.filter((t) => t.kind === 'pathway'), [allTasks]);

  const diff = (f: FormState): TaskUpdateBody => {
    const base = baseline.current;
    const b: TaskUpdateBody = {};
    if (f.title !== base.title) b.title = f.title;
    if (f.text !== base.text) {
      if (isPathway) b.destination = f.text;
      else b.description = f.text;
    }
    if (isPathway && f.branch !== base.branch) b.branch = f.branch === '' ? null : f.branch;
    if (f.status !== base.status) b.status = f.status;
    if (f.priority !== base.priority) b.priority = f.priority === '' ? null : f.priority;
    if (!isPathway && f.parentId !== base.parentId)
      b.parent_id = f.parentId === '' ? null : f.parentId;
    if (hasLinks && !sameList(f.links, base.links)) b.links = f.links;
    if (!sameList([...f.owners].sort(), [...base.owners].sort())) b.assignee_ids = f.owners;
    return b;
  };
  const body = diff(form);
  const dirty = Object.keys(body).length > 0;

  /** PATCH; on success the baseline becomes the snapshot just saved. */
  const save = async (
    b: TaskUpdateBody,
    since: string,
    snap: FormState,
  ): Promise<string | null> => {
    try {
      const saved = await patch.mutateAsync({
        id: task.id,
        body: { ...b, if_unchanged_since: since },
      });
      baseline.current = snap;
      return saved.updated_at;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const c = parseConflict(err.body, b);
        if (c !== null) {
          setConflict({ c, pending: b, snap });
          return null;
        }
      }
      toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
      return null;
    }
  };

  const promote = async () => {
    if (promotedTo.trim() === '') return;
    let since = task.updated_at;
    if (dirty) {
      const after = await save(body, since, form);
      if (after === null) return;
      since = after;
    }
    const snap = { ...formRef.current, status: 'promoted' };
    const promoted = await save(
      { status: 'promoted', promoted_to: promotedTo.trim() },
      since,
      snap,
    );
    if (promoted !== null) {
      lastSeen.current = promoted;
      setForm(snap);
      setPromoting(false);
    }
  };

  const plans = isPathway ? plansOf(ix, task) : [];
  const next = isPathway ? nextStop(ix, task) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="editable-body">
      <div>
        <label className={LABEL} htmlFor="drawer-title">
          Title
        </label>
        <input
          id="drawer-title"
          className={FIELD}
          value={title}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>
      <div>
        <label className={LABEL} htmlFor="drawer-text">
          {isPathway ? 'Destination' : 'Description'}
        </label>
        <textarea
          id="drawer-text"
          rows={isPathway ? 4 : 3}
          className={FIELD}
          value={text}
          onChange={(e) => set('text', e.target.value)}
        />
      </div>
      {isPathway && (
        <>
          <div data-testid="drawer-next">
            <span className={LABEL}>Next</span>
            <span className="text-sm">{next === null ? 'Nothing ready' : displayTitle(next)}</span>
          </div>
          <div>
            <span className={LABEL}>Contains</span>
            {plans.length === 0 ? (
              <span className="text-sm text-slate-400">No plans yet</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {plans.map((p) => (
                  <li key={p.id}>
                    <LinkButton task={p} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className={LABEL} htmlFor="drawer-branch">
              Branch
            </label>
            <input
              id="drawer-branch"
              className={FIELD}
              value={branch}
              onChange={(e) => set('branch', e.target.value)}
            />
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="drawer-status">
            Status
          </label>
          <select
            id="drawer-status"
            className={FIELD}
            value={status}
            onChange={(e) => set('status', e.target.value)}
          >
            {(STATUSES_BY_KIND[task.kind] ?? [task.status])
              // Promote is its own flow (it needs `promoted_to`), not a plain status.
              .filter((s) => s !== 'promoted' || task.status === 'promoted')
              .map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="drawer-priority">
            Priority
          </label>
          <select
            id="drawer-priority"
            className={FIELD}
            value={priority}
            onChange={(e) => set('priority', e.target.value as TaskPriority | '')}
          >
            <option value="">None</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!isPathway && (
        <div>
          <label className={LABEL} htmlFor="drawer-pathway">
            Pathway
          </label>
          <select
            id="drawer-pathway"
            className={FIELD}
            value={parentId}
            onChange={(e) => set('parentId', e.target.value)}
          >
            {!isTicket && <option value="">Unattached</option>}
            {pathways.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasLinks && (
        <div>
          <span className={LABEL}>Links</span>
          <ul className="mb-1 flex flex-col gap-1">
            {links.map((l) => (
              <li key={l} className="flex items-center justify-between text-xs">
                <span className="truncate">{l}</span>
                <button
                  type="button"
                  aria-label={`Remove link ${l}`}
                  onClick={() =>
                    set(
                      'links',
                      links.filter((x) => x !== l),
                    )
                  }
                  className="px-1 text-slate-500"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <input
              aria-label="Add link"
              className={FIELD}
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
            />
            <button
              type="button"
              disabled={newLink.trim() === ''}
              onClick={() => {
                set('links', [...links, newLink.trim()]);
                setNewLink('');
              }}
              className="rounded border border-slate-300 px-2 text-sm dark:border-slate-600"
            >
              Add
            </button>
          </div>
        </div>
      )}
      <div>
        <span className={LABEL}>Owners</span>
        <div className="flex flex-wrap gap-1">
          {users.map((u) => {
            const on = owners.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set('owners', on ? owners.filter((o) => o !== u.id) : [...owners, u.id])
                }
                className={clsx(
                  'rounded-full border px-2 py-0.5 text-xs',
                  on
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300',
                )}
              >
                {u.display_name}
              </button>
            );
          })}
        </div>
      </div>
      {task.promoted_to !== null && (
        <p className="text-sm text-slate-600 dark:text-slate-300">Promoted to {task.promoted_to}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty || patch.isPending}
          onClick={() => void save(body, task.updated_at, form)}
          className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          Save
        </button>
        {isInbox && task.status !== 'promoted' && !promoting && (
          <button
            type="button"
            onClick={() => setPromoting(true)}
            className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600"
          >
            Promote
          </button>
        )}
      </div>
      {promoting && (
        <div className="flex gap-1">
          <input
            aria-label="Promoted to"
            placeholder="plan filename or pathway slug"
            className={FIELD}
            value={promotedTo}
            onChange={(e) => setPromotedTo(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void promote()}
            disabled={promotedTo.trim() === '' || patch.isPending}
            className="rounded bg-slate-900 px-2 text-sm text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            Confirm promote
          </button>
        </div>
      )}
      {conflict !== null && (
        <ConflictDialog
          conflict={conflict.c}
          users={users}
          parentLookup={new Map(allTasks.map((t) => [t.id, t.title]))}
          busy={patch.isPending}
          onCancel={() => setConflict(null)}
          onOverwrite={() => {
            const { c, pending, snap } = conflict;
            void save(pending, c.current_updated_at, snap).then((ok) => {
              if (ok !== null) setConflict(null);
            });
          }}
        />
      )}
    </div>
  );
}
