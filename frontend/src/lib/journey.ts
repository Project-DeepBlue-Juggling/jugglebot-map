import type { Task } from '../api/schemas';
import { INBOX_ORDER, NNL, type InboxKind } from '../theme/nnl';
import {
  INBOX_KINDS,
  isDone,
  nextStop,
  phaseCode,
  phasesOf,
  plansOf,
  priorityRank,
  progress,
  taskState,
  ticketsOf,
  type MapIndex,
} from './derive';

/** Pathways still being walked, in the given order (drops complete and dropped). */
export function activePathways(pathways: readonly Task[]): Task[] {
  return pathways.filter((p) => !isDone(p));
}

/** Pathway hue by index among the ACTIVE Pathways (cycling past 8); a complete one is grey. */
export function pathwayHue(active: readonly Task[], pathwayId: string): string {
  const i = active.findIndex((p) => p.id === pathwayId);
  if (i === -1) return NNL.status.complete;
  return NNL.pathwayHues[i % NNL.pathwayHues.length];
}

/** True when this active Pathway reuses a hue (index >= 8): draw its track dashed. */
export function pathwayHueReused(active: readonly Task[], pathwayId: string): boolean {
  return active.findIndex((p) => p.id === pathwayId) >= NNL.pathwayHues.length;
}

export type StationState = 'done' | 'now' | 'next' | 'later' | 'blocked';

export interface Station {
  task: Task;
  state: StationState;
  /** Phase code (`P3`), `T` for a ticket, the plan's initials for a phase-less plan. */
  code: string;
  /** The plan this station belongs to (null for tickets). */
  plan: Task | null;
  isTicket: boolean;
}

export interface Capsule {
  /** Done plans compressed out of the track. */
  plans: Task[];
  /** Number of done plans, shown as `✓ n plans`. */
  units: number;
  /** Done tickets, shown as `✓ n T`. */
  doneTickets: number;
}

/** A plan's initials (`leg-lead-clamp-age-aware` -> `LLC`), at most 3 letters. */
function planCode(plan: Task): string {
  const words = plan.slug.split(/[^A-Za-z0-9]+/).filter((w) => w !== '');
  return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('') || 'PL';
}

/** The stage state a task draws as (null = not drawn); parked tasks queue as later. */
function stateOf(task: Task, next: Task | null): StationState | null {
  const s = taskState(task);
  if (s === 'excluded') return null;
  if (s === 'parked') return 'later';
  if (s === 'done') return 'done';
  if (s === 'blocked') return 'blocked';
  if (s === 'in_progress') return 'now';
  return next !== null && next.id === task.id ? 'next' : 'later';
}

export interface PlanTrack {
  plan: Task;
  stations: Station[];
}

export interface Journey {
  doneCapsule: Capsule;
  /** Open plans, the one holding Next first, each with its own stations. */
  plans: PlanTrack[];
  /** Open tickets as stations (code `T`), after the plans. */
  tickets: Station[];
  /** Parked plans (never stations). */
  parked: Task[];
  /** The computed Next when it lies outside this Pathway's stations (a blocker), else null. */
  external: Task | null;
}

/** A Pathway as per-plan tracks: done plans in the capsule, the plan holding Next first, then tickets. */
export function journeyByPlan(ix: MapIndex, pathway: Task): Journey {
  const next = nextStop(ix, pathway);
  const capsulePlans: Task[] = [];
  const parked: Task[] = [];
  const open: Task[] = [];
  for (const plan of plansOf(ix, pathway)) {
    const s = taskState(plan);
    if (s === 'done') capsulePlans.push(plan);
    else if (s === 'parked') parked.push(plan);
    else if (s !== 'excluded') open.push(plan);
  }
  const holdsNext = (p: Task) => next !== null && (next.id === p.id || next.parent_id === p.id);
  const ordered = [...open.filter(holdsNext), ...open.filter((p) => !holdsNext(p))];
  const plans: PlanTrack[] = ordered.map((plan) => {
    const stations: Station[] = [];
    for (const ph of phasesOf(ix, plan)) {
      const st = stateOf(ph, next);
      if (st !== null)
        stations.push({ task: ph, state: st, code: phaseCode(ph) || planCode(plan), plan, isTicket: false });
    }
    if (stations.length === 0) {
      const st = stateOf(plan, next);
      if (st !== null)
        stations.push({ task: plan, state: st, code: planCode(plan), plan, isTicket: false });
    }
    return { plan, stations };
  });
  let doneTickets = 0;
  const tickets: Station[] = [];
  for (const t of ticketsOf(ix, pathway)) {
    const s = taskState(t);
    if (s === 'done') doneTickets += 1;
    else if (s !== 'excluded') {
      const st = stateOf(t, next);
      if (st !== null) tickets.push({ task: t, state: st, code: 'T', plan: null, isTicket: true });
    }
  }
  const placed = new Set<string>();
  for (const g of plans) for (const s of g.stations) placed.add(s.task.id);
  for (const s of tickets) placed.add(s.task.id);
  for (const p of capsulePlans) placed.add(p.id);
  const external = next !== null && !placed.has(next.id) ? next : null;
  return {
    doneCapsule: { plans: capsulePlans, units: capsulePlans.length, doneTickets },
    plans,
    tickets,
    parked,
    external,
  };
}

/** How many leading stations are done: the bright track fill covers only this contiguous prefix. */
export function donePrefix(stations: readonly Station[]): number {
  let n = 0;
  while (n < stations.length && stations[n].state === 'done') n += 1;
  return n;
}

export interface ProgressLabel {
  done: number;
  total: number;
  /** `4/9`. */
  text: string;
  /** Tooltip: the stage count is honest about being "so far". */
  title: string;
}

/** The single progress number per Pathway, from derive.progress(). */
export function progressLabel(ix: MapIndex, pathway: Task): ProgressLabel {
  const p = progress(ix, pathway);
  return { done: p.done, total: p.total, text: `${p.done}/${p.total}`, title: 'stages so far' };
}

/** The focus (first not-done) station of a track and the Later stations after it. */
export function splitTrack(stations: readonly Station[]): { focus: Station | null; later: Station[] } {
  const firstOpen = stations.findIndex((s) => s.state !== 'done');
  if (firstOpen === -1) return { focus: null, later: [] };
  return {
    focus: stations[firstOpen],
    later: stations.filter((s, i) => i > firstOpen && s.state === 'later'),
  };
}

const byPriorityThenTitle = (a: Task, b: Task) =>
  priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);

const kindRank = (k: string) => {
  const i = INBOX_ORDER.indexOf(k as InboxKind);
  return i === -1 ? INBOX_ORDER.length : i;
};

export interface InboxPartition {
  /** Open inbox items per ACTIVE Pathway id (the Pathway's one-liners). */
  attached: ReadonlyMap<string, Task[]>;
  /** Everything else (no Pathway, a missing one, or a complete one), per kind, for the rail. */
  unattached: Record<InboxKind, Task[]>;
}

/** Splits every open inbox item exactly once: into its active Pathway, or into the rail. */
export function inboxPartition(ix: MapIndex, pathways: readonly Task[]): InboxPartition {
  const activeIds = new Set(activePathways(pathways).map((p) => p.id));
  const attached = new Map<string, Task[]>();
  const unattached: Record<InboxKind, Task[]> = { bug: [], feature: [], idea: [] };
  for (const t of ix.tasks) {
    if (!INBOX_KINDS.has(t.kind) || isDone(t)) continue;
    if (t.pathway_id !== null && activeIds.has(t.pathway_id)) {
      const list = attached.get(t.pathway_id) ?? [];
      list.push(t);
      attached.set(t.pathway_id, list);
    } else unattached[t.kind as InboxKind].push(t);
  }
  for (const list of attached.values())
    list.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || byPriorityThenTitle(a, b));
  for (const k of INBOX_ORDER) unattached[k].sort(byPriorityThenTitle);
  return { attached, unattached };
}
