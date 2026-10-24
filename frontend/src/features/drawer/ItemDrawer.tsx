import { useMemo, useState } from 'react';
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
    () =>
      allTasks === undefined ? null : buildIndex(allTasks, deps.data ?? [], users.data ?? []),
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
          {task === undefined ? 'Loading…' : `${KIND_LABELS[task.kind] ?? task.kind} · ${statusLabel(task.status)}`}
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
          <p className="text-sm text-red-700 dark:text-red-300">{(detail.error as Error).message}</p>
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
              <TaskDependenciesSection task={task} allTasks={allTasks} />
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
          <p className="text-sm text-slate-700 dark:text-slate-300">{task.description}</p>
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
        <a
          href={`/${task.source_path.split('#')[0]}`}
          className="break-all text-sm text-sky-700 hover:underline dark:text-sky-300"
        >
          {task.source_path.split('#')[0]}
        </a>
      </div>
    </div>
  );
}

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

  const [title, setTitle] = useState(task.title);
  const [text, setText] = useState(isPathway ? task.destination : task.description);
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState<TaskPriority | ''>(task.priority ?? '');
  const [branch, setBranch] = useState(task.branch ?? '');
  const [parentId, setParentId] = useState(task.parent_id ?? '');
  const [links, setLinks] = useState<string[]>(task.links);
  const [newLink, setNewLink] = useState('');
  const [owners, setOwners] = useState<string[]>(task.assignee_ids);
  const [promoting, setPromoting] = useState(false);
  const [promotedTo, setPromotedTo] = useState('');
  const [conflict, setConflict] = useState<{ c: TaskUpdateConflict; pending: TaskUpdateBody } | null>(
    null,
  );

  const pathways = useMemo(() => allTasks.filter((t) => t.kind === 'pathway'), [allTasks]);

  const body = useMemo(() => {
    const b: TaskUpdateBody = {};
    if (title !== task.title) b.title = title;
    if (isPathway) {
      if (text !== task.destination) b.destination = text;
      if (branch !== (task.branch ?? '')) b.branch = branch === '' ? null : branch;
    } else if (text !== task.description) {
      b.description = text;
    }
    if (status !== task.status) b.status = status;
    if (priority !== (task.priority ?? '')) b.priority = priority === '' ? null : priority;
    if (!isPathway && parentId !== (task.parent_id ?? '')) b.parent_id = parentId === '' ? null : parentId;
    if (isInbox && !sameList(links, task.links)) b.links = links;
    if (!sameList([...owners].sort(), [...task.assignee_ids].sort())) b.assignee_ids = owners;
    return b;
  }, [title, text, status, priority, branch, parentId, links, owners, task, isPathway, isInbox]);
  const dirty = Object.keys(body).length > 0;

  const save = async (b: TaskUpdateBody, since: string): Promise<boolean> => {
    try {
      await patch.mutateAsync({ id: task.id, body: { ...b, if_unchanged_since: since } });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const c = parseConflict(err.body, b);
        if (c !== null) {
          setConflict({ c, pending: b });
          return false;
        }
      }
      toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
      return false;
    }
  };

  const promote = async () => {
    if (promotedTo.trim() === '') return;
    if (await save({ status: 'promoted', promoted_to: promotedTo.trim() }, task.updated_at)) {
      setStatus('promoted');
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
        <input id="drawer-title" className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
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
          onChange={(e) => setText(e.target.value)}
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
            <input id="drawer-branch" className={FIELD} value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="drawer-status">
            Status
          </label>
          <select id="drawer-status" className={FIELD} value={status} onChange={(e) => setStatus(e.target.value)}>
            {(STATUSES_BY_KIND[task.kind] ?? [task.status]).map((s) => (
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
      </div>
      {!isPathway && (
        <div>
          <label className={LABEL} htmlFor="drawer-pathway">
            Pathway
          </label>
          <select id="drawer-pathway" className={FIELD} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Unattached</option>
            {pathways.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {isInbox && (
        <div>
          <span className={LABEL}>Links</span>
          <ul className="mb-1 flex flex-col gap-1">
            {links.map((l) => (
              <li key={l} className="flex items-center justify-between text-xs">
                <span className="truncate">{l}</span>
                <button
                  type="button"
                  aria-label={`Remove link ${l}`}
                  onClick={() => setLinks(links.filter((x) => x !== l))}
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
                setLinks([...links, newLink.trim()]);
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
                onClick={() => setOwners(on ? owners.filter((o) => o !== u.id) : [...owners, u.id])}
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
          onClick={() => void save(body, task.updated_at)}
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
            const { c, pending } = conflict;
            void save(pending, c.current_updated_at).then((ok) => {
              if (ok) setConflict(null);
            });
          }}
        />
      )}
    </div>
  );
}
