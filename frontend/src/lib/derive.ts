import type { DependencyEdge, Task, User } from '../api/schemas';

/**
 * Computed map views (never stored): pathway order, progress units, the
 * computed Next, the Now / Next / Later / Done lanes, open blockers, age.
 * Pure functions over the zod `Task` / `DependencyEdge` types; every page
 * builds one `MapIndex` per render (`buildIndex`) and asks it questions.
 */

export const INBOX_KINDS: ReadonlySet<string> = new Set(['idea', 'feature', 'bug']);

const DONE_BY_KIND: Record<string, ReadonlySet<string>> = {
  pathway: new Set(['complete', 'dropped']),
  // The parser maps `complete` to `completed`; `deferred` counts as done-ish.
  plan: new Set(['completed', 'complete', 'archived', 'superseded', 'deferred', 'dropped']),
  phase: new Set(['complete', 'retired']),
  idea: new Set(['complete', 'dropped', 'promoted']),
  feature: new Set(['complete', 'dropped', 'promoted']),
  bug: new Set(['complete', 'dropped', 'promoted']),
  ticket: new Set(['complete', 'dropped']),
};
const DONE_FALLBACK: ReadonlySet<string> = new Set([
  'complete',
  'completed',
  'dropped',
  'archived',
  'superseded',
  'retired',
  'promoted',
]);

/** Is this task finished (done, dropped, retired, promoted, ...) for its kind? */
export function isDone(task: Task): boolean {
  return (DONE_BY_KIND[task.kind] ?? DONE_FALLBACK).has(task.status);
}

/**
 * One normalised state per task, the vocabulary the palette colours:
 * `excluded` = dropped / retired (out of the progress denominator).
 */
export type UnitState = 'done' | 'in_progress' | 'blocked' | 'queued' | 'parked' | 'excluded';

export function taskState(task: Task): UnitState {
  const s = task.status;
  if (s === 'dropped' || s === 'retired') return 'excluded';
  if (isDone(task)) return 'done';
  if (s === 'in_progress' || s === 'qa') return 'in_progress';
  if (s === 'blocked') return 'blocked';
  if (s === 'parked') return 'parked';
  // A phaseless active plan is live work; a claimed open ticket is being worked.
  if (task.kind === 'plan' && s === 'active') return 'in_progress';
  if (task.kind === 'ticket' && s === 'open' && task.assignee_ids.length > 0) return 'in_progress';
  return 'queued';
}

export interface MapIndex {
  tasks: readonly Task[];
  byId: ReadonlyMap<string, Task>;
  users: ReadonlyMap<string, User>;
  /** parent_id -> children, unordered. */
  childrenOf: ReadonlyMap<string, readonly Task[]>;
  /** pathway_id -> every task attached to the pathway (any depth). */
  inPathway: ReadonlyMap<string, readonly Task[]>;
  /** blocked id -> blocker ids; blocker id -> blocked ids. */
  blockerIds: ReadonlyMap<string, readonly string[]>;
  blockedIds: ReadonlyMap<string, readonly string[]>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr === undefined) m.set(k, [v]);
  else arr.push(v);
}

export function buildIndex(
  tasks: readonly Task[],
  deps: readonly DependencyEdge[],
  users: readonly User[] = [],
): MapIndex {
  const childrenOf = new Map<string, Task[]>();
  const inPathway = new Map<string, Task[]>();
  const blockerIds = new Map<string, string[]>();
  const blockedIds = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parent_id !== null) push(childrenOf, t.parent_id, t);
    if (t.pathway_id !== null) push(inPathway, t.pathway_id, t);
  }
  for (const d of deps) {
    push(blockerIds, d.blocked_id, d.blocker_id);
    push(blockedIds, d.blocker_id, d.blocked_id);
  }
  return {
    tasks,
    byId: new Map(tasks.map((t) => [t.id, t])),
    users: new Map(users.map((u) => [u.id, u])),
    childrenOf,
    inPathway,
    blockerIds,
    blockedIds,
  };
}

function resolve(ix: MapIndex, ids: readonly string[] | undefined): Task[] {
  const out: Task[] = [];
  for (const id of ids ?? []) {
    const t = ix.byId.get(id);
    if (t !== undefined) out.push(t);
  }
  return out;
}

/** Every blocker of `id` (done or not). */
export function blockersOf(ix: MapIndex, id: string): Task[] {
  return resolve(ix, ix.blockerIds.get(id));
}

/** Every task `id` blocks. */
export function blockedBy(ix: MapIndex, id: string): Task[] {
  return resolve(ix, ix.blockedIds.get(id));
}

/** Blockers of `id` whose blocker task is not done. */
export function openBlockers(ix: MapIndex, id: string): Task[] {
  return blockersOf(ix, id).filter((b) => !isDone(b));
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PATHWAY_STATUS_RANK: Record<string, number> = {
  active: 0,
  in_progress: 0,
  blocked: 1,
  not_started: 2,
  complete: 3,
  dropped: 4,
};
const STATE_RANK: Record<UnitState, number> = {
  in_progress: 0,
  blocked: 1,
  queued: 2,
  parked: 3,
  done: 4,
  excluded: 5,
};

export function priorityRank(p: string | null): number {
  return p === null ? 3 : (PRIORITY_RANK[p] ?? 3);
}

/** Pathways ordered by priority (high..none), then status, then title. */
export function orderPathways(tasks: readonly Task[]): Task[] {
  return tasks
    .filter((t) => t.kind === 'pathway')
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (PATHWAY_STATUS_RANK[a.status] ?? 3) - (PATHWAY_STATUS_RANK[b.status] ?? 3) ||
        a.title.localeCompare(b.title),
    );
}

/** A pathway's plans: plans with an open blocker last, then by state, then title. */
export function plansOf(ix: MapIndex, pathway: Task): Task[] {
  const waits = (p: Task) => (openBlockers(ix, p.id).length > 0 ? 1 : 0);
  return (ix.childrenOf.get(pathway.id) ?? [])
    .filter((c) => c.kind === 'plan')
    .sort(
      (a, b) =>
        waits(a) - waits(b) ||
        STATE_RANK[taskState(a)] - STATE_RANK[taskState(b)] ||
        a.title.localeCompare(b.title),
    );
}

/** A plan's phases in plan order (the parser's rank, then the slug). */
export function phasesOf(ix: MapIndex, plan: Task): Task[] {
  return (ix.childrenOf.get(plan.id) ?? [])
    .filter((c) => c.kind === 'phase')
    .sort(
      (a, b) =>
        (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
        a.slug.localeCompare(b.slug, undefined, { numeric: true }),
    );
}

export interface ProgressUnit {
  /** The phase, or the plan itself when it has no phases. */
  task: Task;
  plan: Task;
}

/**
 * The stops of a pathway: each plan's phases, or the plan when it has none.
 * A finished (done / dropped / superseded) or parked plan is one unit itself,
 * so its leftover phases never sit in the denominator or in What-remains.
 */
export function progressUnits(ix: MapIndex, pathway: Task): ProgressUnit[] {
  const out: ProgressUnit[] = [];
  for (const plan of plansOf(ix, pathway)) {
    const ph = phasesOf(ix, plan);
    const ps = taskState(plan);
    if (ph.length === 0 || ps === 'done' || ps === 'excluded' || ps === 'parked')
      out.push({ task: plan, plan });
    else for (const p of ph) out.push({ task: p, plan });
  }
  return out;
}

export interface Progress {
  units: ProgressUnit[];
  /** Units counted in "x of y": everything except dropped / retired. */
  total: number;
  done: number;
  excluded: number;
  /** Units neither done nor excluded, in stop order. */
  remaining: ProgressUnit[];
}

export function progress(ix: MapIndex, pathway: Task): Progress {
  const units = progressUnits(ix, pathway);
  let done = 0;
  let excluded = 0;
  const remaining: ProgressUnit[] = [];
  for (const u of units) {
    const s = taskState(u.task);
    if (s === 'excluded') excluded += 1;
    else if (s === 'done') done += 1;
    else remaining.push(u);
  }
  return { units, total: units.length - excluded, done, excluded, remaining };
}

const finished = (t: Task) => {
  const s = taskState(t);
  return s === 'done' || s === 'excluded';
};

/**
 * The pathway's next stop: the first unfinished, unblocked phase of the first
 * ready plan (open, not parked, no open blocker), or that plan when it has no
 * phases. When every open plan waits on a blocker, or every unfinished phase of
 * the ready plans does, Next is the first open blocker (a task). No open plans -> null.
 */
export function nextStop(ix: MapIndex, pathway: Task): Task | null {
  const open = plansOf(ix, pathway).filter((p) => !finished(p) && taskState(p) !== 'parked');
  if (open.length === 0) return null;
  const ready = open.filter((p) => openBlockers(ix, p.id).length === 0);
  if (ready.length === 0) return openBlockers(ix, open[0].id)[0] ?? null;
  for (const plan of ready) {
    const phases = phasesOf(ix, plan);
    if (phases.length === 0) return plan;
    const n = phases.find((p) => !finished(p) && openBlockers(ix, p.id).length === 0);
    if (n !== undefined) return n;
  }
  // Every unfinished phase of every ready plan waits: surface the first blocker.
  for (const plan of ready) {
    for (const ph of phasesOf(ix, plan)) {
      if (finished(ph)) continue;
      const b = openBlockers(ix, ph.id)[0];
      if (b !== undefined) return b;
    }
  }
  return null;
}

/** Tickets of a pathway (any status). */
export function ticketsOf(ix: MapIndex, pathway: Task): Task[] {
  return (ix.inPathway.get(pathway.id) ?? []).filter((t) => t.kind === 'ticket');
}

/** Idea / feature / bug items attached to a pathway (any status). */
export function attachedInbox(ix: MapIndex, pathway: Task): Task[] {
  return (ix.inPathway.get(pathway.id) ?? []).filter((t) => INBOX_KINDS.has(t.kind));
}

export interface Lanes {
  now: Task[];
  next: Task[];
  later: Task[];
  done: Task[];
}

/**
 * Now / Next / Later / Done for one pathway. Each task lands once, checked in
 * the order done -> now -> next -> later. Now wins over Next on purpose: an
 * in-progress computed Next stays in Now and the Next lane is then empty (the
 * page rings the next card wherever it sits). A plan with phases contributes its
 * phases, unless it is done, dropped or parked (then the plan card itself).
 * Attached inbox items never go to Now. A computed Next outside the pathway
 * (a blocker) is appended to Next.
 */
export function lanes(ix: MapIndex, pathway: Task): Lanes {
  const next = nextStop(ix, pathway);
  const out: Lanes = { now: [], next: [], later: [], done: [] };
  const put = (t: Task, mayBeNow: boolean) => {
    const s = taskState(t);
    if (s === 'done' || s === 'excluded') out.done.push(t);
    else if (mayBeNow && (s === 'in_progress' || s === 'blocked')) out.now.push(t);
    else if (next !== null && next.id === t.id) out.next.push(t);
    else out.later.push(t);
  };
  for (const plan of plansOf(ix, pathway)) {
    const phases = phasesOf(ix, plan);
    const s = taskState(plan);
    if (phases.length === 0 || s === 'done' || s === 'excluded' || s === 'parked') put(plan, true);
    else for (const p of phases) put(p, true);
  }
  for (const t of ticketsOf(ix, pathway)) put(t, true);
  for (const t of attachedInbox(ix, pathway)) put(t, false);
  if (next !== null && !out.next.some((t) => t.id === next.id)) {
    const placed = [...out.now, ...out.later, ...out.done].some((t) => t.id === next.id);
    if (!placed) out.next.push(next);
  }
  return out;
}

/** The Front page wall: every inbox-kind item not done, by priority, kind, title. */
export function wallItems(ix: MapIndex): Task[] {
  return ix.tasks
    .filter((t) => INBOX_KINDS.has(t.kind) && !isDone(t))
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        a.kind.localeCompare(b.kind) ||
        a.title.localeCompare(b.title),
    );
}

/** A plan's short name (its file slug). */
export function planShortName(plan: Task): string {
  return plan.slug;
}

/** A phase's step code (`P1`, `R2`, `STAGE`) from its `<plan>.md#<code>` slug. */
export function phaseCode(phase: Task): string {
  const i = phase.slug.lastIndexOf('#');
  return i === -1 ? '' : phase.slug.slice(i + 1);
}

/** The label a card or list row shows: a plan's slug, a phase's code + heading. */
export function displayTitle(task: Task): string {
  if (task.kind === 'plan') return planShortName(task);
  if (task.kind === 'phase') {
    const code = phaseCode(task);
    return code === '' ? task.title : `${code} ${task.title}`;
  }
  return task.title;
}

/** Age since filing: `today`, `3d`, `2w`, `5mo`. Empty for an unparsable date. */
export function formatAge(createdAt: string, now: Date = new Date()): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (Number.isNaN(ms)) return '';
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

/** A plan card's name: its title up to the first colon, at most 40 chars. */
export function planCardName(plan: Task): string {
  const head = plan.title.split(':')[0].trim();
  return head.length > 40 ? `${head.slice(0, 39)}…` : head;
}

/**
 * A phase's summary from its description: the `**Approach:**` paragraph when
 * present, else the first paragraph; leading bold label and markdown
 * emphasis / code markers stripped; clipped to 240 characters.
 */
export function phaseSummary(task: Task): string {
  const paras = (task.description ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const para = paras.find((p) => p.startsWith('**Approach:**')) ?? paras[0] ?? '';
  const text = para
    .replace(/^\*\*[^*]+\*\*\s*/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
}
