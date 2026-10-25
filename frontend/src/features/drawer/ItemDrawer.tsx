import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
  formatAge,
  fullDisplayTitle,
  INBOX_KINDS,
  nextStop,
  orderPathways,
  phaseCode,
  phasesOf,
  plansOf,
  type MapIndex,
} from '../../lib/derive';
import ConflictDialog from '../../tasks/ConflictDialog';
import TaskDependenciesSection from '../../tasks/TaskDependenciesSection';
import { PRIORITY_LABELS, PRIORITY_OPTIONS } from '../../tasks/priority';
import { NNL } from '../../theme/nnl';
import { KIND_LABELS, STATUSES_BY_KIND, statusLabel } from '../../theme/palette';
import { hasModifier, isShortcutTarget, modalIsOpen } from '../../ui/keyboard';
import { useToast } from '../../ui/useToast';
import { parseConflict } from './conflict';
import { useDrawer } from './drawerContext';
import { MarkdownField, Title } from './fields';

interface DrawerProps {
  taskId: string;
  onClose: () => void;
  onOpen: (taskId: string) => void;
  /** True when a page's DrawerSlot hosts it (a flex child), false for the overlay. */
  docked?: boolean;
}

const GHOST =
  'h-7 w-full rounded border border-transparent bg-transparent px-1 text-[13px] text-dr-hi hover:border-dr-strong focus:border-dr-focus focus:outline-none focus:ring-1 focus:ring-dr-focus';
const FIELD =
  'w-full rounded border border-dr-strong bg-transparent px-2 py-1 text-[13px] text-dr-hi focus:outline-none focus:ring-2 focus:ring-dr-focus';
const LINK_BTN = 'text-left text-[13px] text-dr-link underline-offset-2 hover:underline';

/**
 * The one shared drawer. Reading view by default (full title, rendered
 * Markdown, compact properties); pathways and inbox items/tickets edit in
 * place, plans and phases are read-only views of their plan file (the server
 * answers 405 to a write). Every PATCH carries `if_unchanged_since`; a 409
 * "Task was modified" raises the ConflictDialog with the server's `current`.
 */
export default function ItemDrawer({ taskId, onClose, onOpen, docked = false }: DrawerProps) {
  const detail = useTask(taskId);
  const all = useTasks();
  const deps = useDependencies();
  const users = useUsers();
  const allTasks = all.data;
  // Render at once from the list cache; the detail (blocking / blocked_by)
  // arrives in the background and only gates the dependency sections.
  const cached = allTasks?.find((t) => t.id === taskId);
  const task: TaskDetail | undefined =
    detail.data ?? (cached === undefined ? undefined : { ...cached, blocking: [], blocked_by: [] });
  const detailReady = detail.data !== undefined;

  const ix = useMemo(
    () => (allTasks === undefined ? null : buildIndex(allTasks, deps.data ?? [], users.data ?? [])),
    [allTasks, deps.data, users.data],
  );

  const depsNode =
    task === undefined || ix === null || allTasks === undefined ? null : !detailReady ? (
      <p data-testid="deps-loading" className="mt-4 text-xs text-dr-lo">
        Loading dependencies…
      </p>
    ) : (
      <details
        open={task.blocking.length + task.blocked_by.length > 0}
        className="mt-4 border-t border-dr-border pt-3"
        data-testid="deps-details"
      >
        <summary className="cursor-pointer text-xs font-medium text-dr-lo">
          <span>Dependencies</span>
          <span aria-hidden="true"> · {task.blocking.length + task.blocked_by.length}</span>
        </summary>
        <div className="mt-2">
          {task.editable ? (
            // Titles resolve from every task; the server refuses a phase as a
            // blocker, so only the blocked-by picker drops phases.
            <TaskDependenciesSection
              bare
              task={task}
              allTasks={allTasks}
              blockerFilter={(t) => t.kind !== 'phase'}
            />
          ) : (
            <ReadOnlyDependencies task={task} ix={ix} onOpen={onOpen} />
          )}
        </div>
      </details>
    );

  const hue =
    task === undefined || allTasks === undefined
      ? NNL.border
      : NNL.pathwayHues[
          Math.max(
            0,
            orderPathways(allTasks.filter((t) => t.kind === 'pathway')).findIndex(
              (p) => p.id === (task.kind === 'pathway' ? task.id : task.pathway_id),
            ),
          ) % NNL.pathwayHues.length
        ];

  return (
    <aside
      role="complementary"
      aria-label="Item drawer"
      className={clsx(
        'flex flex-col bg-dr-bg text-dr-body',
        docked
          ? 'h-full min-h-0 w-[clamp(360px,28vw,560px)] rounded-md border border-dr-border'
          : 'fixed right-0 top-0 z-30 h-full w-[min(560px,100vw)] border-l border-dr-border shadow-xl',
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-dr-border px-5">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-dr-med">
          {task === undefined ? (
            'Loading…'
          ) : (
            <>
              <KindGlyph task={task} hue={hue} />
              <span className="shrink-0">{KIND_LABELS[task.kind] ?? task.kind}</span>
              {task.kind === 'phase' && ix !== null && task.parent_id !== null && (
                <PhaseCrumb task={task} ix={ix} onOpen={onOpen} />
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="h-7 w-7 shrink-0 rounded text-[18px] leading-none text-dr-lo hover:text-dr-hi"
        >
          ×
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {detail.error !== null && (
          <p className="px-5 pt-4 text-sm text-red-700 dark:text-red-300">
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
                hue={hue}
                deps={depsNode}
              />
            ) : (
              <ReadOnlyBody task={task} ix={ix} onOpen={onOpen} deps={depsNode} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function KindGlyph({ task, hue }: { task: Task; hue: string }) {
  const k = (NNL.kind as Record<string, { hex: string; glyph: string }>)[task.kind];
  if (k !== undefined) {
    return (
      <span aria-hidden="true" style={{ color: k.hex }} className="text-[12px]">
        {k.glyph}
      </span>
    );
  }
  if (task.kind === 'pathway')
    return (
      <span aria-hidden="true" style={{ color: hue }} className="text-[12px]">
        ◆
      </span>
    );
  if (task.kind === 'ticket')
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-dr-strong text-[9px] font-bold"
      >
        T
      </span>
    );
  return null;
}

function PhaseCrumb({
  task,
  ix,
  onOpen,
}: {
  task: Task;
  ix: MapIndex;
  onOpen: (id: string) => void;
}) {
  const parent = task.parent_id === null ? undefined : ix.byId.get(task.parent_id);
  if (parent === undefined) return null;
  return (
    <>
      <span aria-hidden="true" className="shrink-0 whitespace-nowrap">
        · {phaseCode(task)} ·
      </span>
      <button
        type="button"
        onClick={() => onOpen(parent.id)}
        title={parent.title}
        className="min-w-0 truncate text-left text-dr-link hover:underline"
      >
        {parent.title}
      </button>
    </>
  );
}

function LinkButton({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(task.id)} className={LINK_BTN}>
      {fullDisplayTitle(task)}
    </button>
  );
}

/** A status as a coloured dot plus its label (amber stays reserved for Next). */
function StatusDot({ status }: { status: string }) {
  const done = ['complete', 'completed', 'archived', 'retired', 'dropped', 'superseded'];
  const color = done.includes(status)
    ? NNL.status.complete
    : ['in_progress', 'active'].includes(status)
      ? 'var(--dr-link)'
      : NNL.status.later;
  return (
    <span
      aria-hidden="true"
      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function Props({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-3 grid grid-cols-[96px_1fr] items-start gap-x-3 gap-y-1.5">{children}</dl>
  );
}

function Row({
  label,
  htmlFor,
  children,
  testId,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <>
      <dt className="flex min-h-7 items-center text-xs font-medium text-dr-lo">
        {htmlFor === undefined ? label : <label htmlFor={htmlFor}>{label}</label>}
      </dt>
      <dd data-testid={testId} className="flex min-h-7 min-w-0 items-center text-[13px] text-dr-hi">
        <div className="min-w-0 flex-1">{children}</div>
      </dd>
    </>
  );
}

function Meta({ task }: { task: TaskDetail }) {
  const age = formatAge(task.updated_at);
  return (
    <p className="mt-4 text-[11px] text-dr-lo">
      <span className="break-all font-mono">{task.source_path.split('#')[0]}</span>
      {age !== '' && (
        <>
          {' '}
          · updated {age === 'today' ? 'today' : `${age} ago`} by {task.updated_by}
        </>
      )}
    </p>
  );
}

/** Plans and phases: fields come from the plan file, so nothing here writes. */
function ReadOnlyBody({
  task,
  ix,
  onOpen,
  deps,
}: {
  task: TaskDetail;
  ix: MapIndex;
  onOpen: (id: string) => void;
  deps: ReactNode;
}) {
  const parent = task.parent_id === null ? undefined : ix.byId.get(task.parent_id);
  return (
    <div className="px-5 pb-6 pt-4" data-testid="readonly-body">
      <Title value={task.title} display={fullDisplayTitle(task)} editable={false} onChange={noop} />
      <Props>
        <Row label="Status">
          <span className="inline-flex items-center">
            <StatusDot status={task.status} />
            {statusLabel(task.status)}
          </span>
        </Row>
        {task.kind === 'phase' && parent !== undefined && (
          <Row label="Plan">
            <LinkButton task={parent} onOpen={onOpen} />
          </Row>
        )}
        {task.kind === 'plan' && task.branch !== null && task.branch !== '' && (
          <Row label="Branch">
            <span className="break-all font-mono text-xs">{task.branch}</span>
          </Row>
        )}
        {task.kind === 'plan' && (
          <Row label="Phases">
            <ul className="flex flex-col gap-1">
              {phasesOf(ix, task).map((ph) => (
                <li key={ph.id} className="flex items-start justify-between gap-2">
                  <LinkButton task={ph} onOpen={onOpen} />
                  <span className="shrink-0 text-xs text-dr-lo">{statusLabel(ph.status)}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
      </Props>
      {task.description !== '' && (
        <MarkdownField
          label={task.kind === 'plan' ? 'Scope' : 'Summary'}
          value={task.description}
          editable={false}
        />
      )}
      {deps}
      <Meta task={task} />
    </div>
  );
}

const noop = () => undefined;

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
      <p className="text-xs text-dr-lo">None</p>
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
    <div data-testid="readonly-dependencies" className="flex flex-col gap-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-dr-lo">Blocked by</span>
        {rows(task.blocked_by.map((e) => e.blocker_id))}
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-dr-lo">Blocks</span>
        {rows(task.blocking.map((e) => e.blocked_id))}
      </div>
      <p className="text-xs text-dr-lo">
        Dependencies of plans and phases are edited in the plan file
      </p>
    </div>
  );
}

interface FormState {
  title: string;
  /** Pathway only: the Destination (frontmatter). */
  destination: string;
  /** The file body: a Pathway's Notes, every other kind's Description. */
  body: string;
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
    destination: task.kind === 'pathway' ? task.destination : '',
    body: task.description,
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

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function LinkRow({ url, onRemove }: { url: string; onRemove: () => void }) {
  const gh = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/(\d+)/.exec(url);
  const web = /^https?:\/\//i.test(url);
  return (
    <li className="group flex items-start justify-between gap-2 text-[13px]">
      {web ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={url}
          className="min-w-0 break-all text-dr-link hover:underline"
        >
          {gh === null ? url : `#${gh[2]} · GitHub ${gh[1] === 'pull' ? 'pull request' : 'issue'}`}
        </a>
      ) : (
        <span className="min-w-0 break-all">{url}</span>
      )}
      <button
        type="button"
        aria-label={`Remove link ${url}`}
        onClick={onRemove}
        className="shrink-0 px-1 text-dr-lo opacity-0 hover:text-dr-hi focus:opacity-100 group-hover:opacity-100"
      >
        ×
      </button>
    </li>
  );
}

function EditableBody({
  task,
  ix,
  allTasks,
  users,
  onOpen,
  hue,
  deps,
}: {
  task: TaskDetail;
  ix: MapIndex;
  allTasks: Task[];
  users: User[];
  onOpen: (id: string) => void;
  hue: string;
  deps: ReactNode;
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
  const {
    title,
    destination,
    body: bodyText,
    status,
    priority,
    branch,
    parentId,
    links,
    owners,
  } = form;
  const [newLink, setNewLink] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promotedTo, setPromotedTo] = useState('');
  const [bodyEditing, setBodyEditing] = useState(false);
  const [destEditing, setDestEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const wrap = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = window.setTimeout(() => setSaveState('idle'), 4000);
    return () => window.clearTimeout(t);
  }, [saveState]);

  const pathways = useMemo(() => allTasks.filter((t) => t.kind === 'pathway'), [allTasks]);

  const diff = (f: FormState): TaskUpdateBody => {
    const base = baseline.current;
    const b: TaskUpdateBody = {};
    if (f.title !== base.title) b.title = f.title;
    if (isPathway && f.destination !== base.destination) b.destination = f.destination;
    if (f.body !== base.body) b.description = f.body;
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

  // Leaving the drawer (close, click outside, another item) saves first.
  const drawerCtx = useDrawer();
  const flushRef = useRef<() => boolean | Promise<boolean>>(() => true);
  flushRef.current = () => {
    const b = diff(formRef.current);
    if (Object.keys(b).length === 0) return true;
    return save(b, task.updated_at, formRef.current).then((at) => at !== null);
  };
  const setFlush = drawerCtx?.setFlush;
  useEffect(() => {
    if (setFlush === undefined) return;
    setFlush(() => flushRef.current());
    return () => setFlush(null);
  }, [setFlush]);

  /** PATCH; on success the baseline becomes the snapshot just saved. */
  const save = async (
    b: TaskUpdateBody,
    since: string,
    snap: FormState,
  ): Promise<string | null> => {
    setSaveState('saving');
    try {
      const saved = await patch.mutateAsync({
        id: task.id,
        body: { ...b, if_unchanged_since: since },
      });
      baseline.current = snap;
      setSaveState('saved');
      return saved.updated_at;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const c = parseConflict(err.body, b);
        if (c !== null) {
          setSaveState('idle');
          setConflict({ c, pending: b, snap });
          return null;
        }
      }
      setSaveState('failed');
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (modalIsOpen(wrap.current)) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (dirty && !patch.isPending) void save(body, task.updated_at, form);
    } else if (e.key === 'e' && !hasModifier(e.nativeEvent) && isShortcutTarget()) {
      e.preventDefault();
      setBodyEditing(true);
    }
  };

  const plans = isPathway ? plansOf(ix, task) : [];
  const next = isPathway ? nextStop(ix, task) : null;
  const statusText =
    saveState === 'saving'
      ? 'Saving…'
      : dirty
        ? saveState === 'failed'
          ? 'Not saved'
          : 'Unsaved changes'
        : saveState === 'saved'
          ? 'Saved'
          : '';

  return (
    <div ref={wrap} onKeyDown={onKeyDown} className="flex min-h-full flex-col">
      <div className="flex-1 px-5 pb-4 pt-4" data-testid="editable-body">
        <Title value={title} editable onChange={(v) => set('title', v)} />
        <Props>
          <Row label="Status" htmlFor="drawer-status">
            <div className="flex items-center">
              <StatusDot status={status} />
              <select
                id="drawer-status"
                className={GHOST}
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
          </Row>
          <Row label="Priority" htmlFor="drawer-priority">
            <select
              id="drawer-priority"
              className={GHOST}
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
          </Row>
          {!isPathway && (
            <Row label="Pathway" htmlFor="drawer-pathway">
              <select
                id="drawer-pathway"
                className={GHOST}
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
            </Row>
          )}
          {isPathway && (
            <>
              <Row label="Next" testId="drawer-next">
                {next === null ? 'Nothing ready' : <LinkButton task={next} onOpen={onOpen} />}
              </Row>
              <Row label="Contains">
                {plans.length === 0 ? (
                  <span className="text-dr-lo">No plans yet</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {plans.map((p) => (
                      <li key={p.id}>
                        <LinkButton task={p} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                )}
              </Row>
              <Row label="Branch" htmlFor="drawer-branch">
                <input
                  id="drawer-branch"
                  className={GHOST}
                  value={branch}
                  onChange={(e) => set('branch', e.target.value)}
                />
              </Row>
            </>
          )}
          <Row label="Owners">
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
                        ? 'border-dr-hi bg-dr-hi text-dr-bg'
                        : 'border-dr-strong text-dr-body hover:text-dr-hi',
                    )}
                  >
                    {u.display_name}
                  </button>
                );
              })}
            </div>
          </Row>
          {hasLinks && (
            <Row label="Links">
              <ul className="flex flex-col gap-1">
                {links.map((l) => (
                  <LinkRow
                    key={l}
                    url={l}
                    onRemove={() =>
                      set(
                        'links',
                        links.filter((x) => x !== l),
                      )
                    }
                  />
                ))}
              </ul>
              {addingLink ? (
                <div className="mt-1 flex gap-1">
                  <input
                    aria-label="Add link"
                    className={FIELD}
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && newLink.trim() !== '') {
                        e.preventDefault();
                        set('links', [...links, newLink.trim()]);
                        setNewLink('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={newLink.trim() === ''}
                    onClick={() => {
                      set('links', [...links, newLink.trim()]);
                      setNewLink('');
                    }}
                    className="rounded border border-dr-strong px-2 text-sm disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingLink(true)}
                  className="text-xs text-dr-link hover:underline"
                >
                  + Add link
                </button>
              )}
            </Row>
          )}
          {task.promoted_to !== null && <Row label="Promoted to">{task.promoted_to}</Row>}
          {isInbox && task.filed_by !== null && task.filed_by !== '' && (
            <Row label="Filed by">{task.filed_by}</Row>
          )}
        </Props>
        {isPathway && (
          <MarkdownField
            label="Destination"
            value={destination}
            editable
            onChange={(v) => set('destination', v)}
            editing={destEditing}
            onEditingChange={setDestEditing}
            callout={hue}
            emptyText="Add a destination…"
          />
        )}
        <MarkdownField
          label={isPathway ? 'Notes' : 'Description'}
          value={bodyText}
          editable
          onChange={(v) => set('body', v)}
          editing={bodyEditing}
          onEditingChange={setBodyEditing}
          emptyText={isPathway ? 'Add notes…' : 'Add a description…'}
        />
        {deps}
        <Meta task={task} />
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
      <div className="sticky bottom-0 flex min-h-[52px] items-center gap-2 border-t border-dr-border bg-dr-bg px-5 py-2">
        {promoting ? (
          <div className="flex w-full gap-1">
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
              className="shrink-0 rounded bg-dr-hi px-2 text-sm text-dr-bg disabled:opacity-40"
            >
              Confirm promote
            </button>
          </div>
        ) : (
          <>
            <span
              role="status"
              aria-live="polite"
              className={clsx(
                'mr-auto text-xs',
                statusText === 'Not saved'
                  ? 'text-[#fe8b83]'
                  : statusText === 'Saved'
                    ? 'text-dr-lo'
                    : 'text-dr-med',
              )}
            >
              {statusText}
            </span>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setForm(baseline.current);
                  setSaveState('idle');
                }}
                className="text-sm text-dr-med hover:text-dr-hi"
              >
                Discard
              </button>
            )}
            {isInbox && task.status !== 'promoted' && (
              <button
                type="button"
                onClick={() => setPromoting(true)}
                className="rounded border border-dr-strong px-3 py-1 text-sm text-dr-hi"
              >
                Promote
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || patch.isPending}
              onClick={() => void save(body, task.updated_at, form)}
              className="rounded bg-dr-hi px-3 py-1 text-sm text-dr-bg disabled:opacity-40"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
