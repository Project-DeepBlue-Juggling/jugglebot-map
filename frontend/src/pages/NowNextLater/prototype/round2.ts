// PROTOTYPE round 2 (branch prototype/nnl-relayout, never merged): shared pure helpers for
// variants E, F, G. Implements the critic's fixes (a) journey order, (c) Later without
// attached inbox items, (d) one progress number, (e) Arrived shelf. No React here.
import type { Task } from '../../../api/schemas';
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
} from '../../../lib/derive';
import type { MapView } from '../../FrontPage/mapView';

/** The critic's dark palette: three channels, three encodings (pathway hue / status / kind). */
export const TOKENS = {
  canvas: '#0e131a',
  surface: '#151b24',
  raised: '#1c2430',
  border: '#2b3542',
  borderStrong: '#3b4757',
  textHi: '#e7ecf3',
  textMed: '#a8b3c2',
  textLo: '#8390a2',
  status: {
    done: '#68ca80',
    now: '#70adfb',
    /** Reserved: amber means Next and nothing else. */
    next: '#f7b83d',
    later: '#7d8899',
    blocked: '#f75d59',
    /** Blocked as TEXT (the mark hue fails 4.5:1). */
    blockedText: '#fe8b83',
    complete: '#7d8792',
  },
  kind: {
    bug: { hex: '#ef6e88', glyph: '■', label: 'Bug' },
    feature: { hex: '#5abdf2', glyph: '●', label: 'Feature' },
    idea: { hex: '#c2a7f4', glyph: '◇', label: 'Idea' },
  },
  /** Eight pathway hues (indigo, teal, orange, lime, orchid, olive, sage, sand). */
  pathwayHues: [
    '#95a4f6',
    '#39c3ae',
    '#e79363',
    '#99b860',
    '#d58ecf',
    '#b4af61',
    '#6fc082',
    '#d3b99b',
  ],
} as const;

export type InboxKind = 'bug' | 'feature' | 'idea';
export const INBOX_ORDER: readonly InboxKind[] = ['bug', 'feature', 'idea'];

/** A pathway is arrived when it is complete (a dropped pathway is hidden, not arrived). */
export function isArrived(pathway: Task): boolean {
  return isDone(pathway) && pathway.status !== 'dropped';
}

/** Pathways still being walked, in `view.pathways` order (drops complete and dropped). */
export function activePathways(view: MapView): Task[] {
  return view.pathways.filter((p) => !isDone(p));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m === null) return '';
  return `${MONTHS[Number(m[2]) - 1] ?? ''} ${Number(m[3])}`;
}

export interface Arrived {
  pathway: Task;
  /** ISO date `YYYY-MM-DD`: "met <date>" in the destination, else any date in destination/description, else updated_at. */
  date: string;
  /** `Oct 13`. */
  label: string;
}

/** Complete pathways, most recently arrived first, each with its completion date. */
export function arrivedPathways(view: MapView): Arrived[] {
  const out: Arrived[] = [];
  for (const p of view.pathways) {
    if (!isArrived(p)) continue;
    const text = `${p.destination}\n${p.description}`;
    const m =
      /met\s+(\d{4}-\d{2}-\d{2})/.exec(text) ?? /(\d{4}-\d{2}-\d{2})/.exec(text) ?? null;
    const date = m !== null ? m[1] : p.updated_at.slice(0, 10);
    out.push({ pathway: p, date, label: shortDate(date) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Pathway hue by index among ACTIVE pathways (view.pathways order, cycling past 8); complete pathways are grey. */
export function pathwayHue(view: MapView, pathwayId: string): string {
  const active = activePathways(view);
  const i = active.findIndex((p) => p.id === pathwayId);
  if (i === -1) return TOKENS.status.complete;
  return TOKENS.pathwayHues[i % TOKENS.pathwayHues.length];
}

/** True when this active pathway reuses a hue (index >= 8): draw its track dashed. */
export function pathwayHueReused(view: MapView, pathwayId: string): boolean {
  return activePathways(view).findIndex((p) => p.id === pathwayId) >= TOKENS.pathwayHues.length;
}

export type StationState = 'done' | 'now' | 'next' | 'later' | 'blocked';

export interface Station {
  task: Task;
  state: StationState;
  /** Phase code (`P3`), `T` for a ticket, the plan's initials for a phase-less plan. */
  code: string;
  /** The plan this station belongs to (null for tickets and for an external Next). */
  plan: Task | null;
  isTicket: boolean;
}

export interface Capsule {
  /** Done plans compressed out of the track. */
  plans: Task[];
  /** Done plans plus done tickets: the number shown as `✓ n`. */
  units: number;
}

export interface Journey {
  doneCapsule: Capsule;
  stations: Station[];
  /** Parked plans (never stations). */
  parked: Task[];
  /** The computed Next when it lies outside this pathway's stations (a blocker), else null. */
  external: Task | null;
}

/** A plan's initials (`leg-lead-clamp-age-aware` -> `LLC`), at most 3 letters. */
function planCode(plan: Task): string {
  const words = plan.slug.split(/[^A-Za-z0-9]+/).filter((w) => w !== '');
  return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('') || 'PL';
}

function stateOf(task: Task, next: Task | null): StationState | null {
  const s = taskState(task);
  if (s === 'excluded' || s === 'parked') return s === 'parked' ? 'later' : null;
  if (s === 'done') return 'done';
  if (s === 'blocked') return 'blocked';
  if (s === 'in_progress') return 'now';
  return next !== null && next.id === task.id ? 'next' : 'later';
}

export interface PlanTrack {
  plan: Task;
  stations: Station[];
}

export interface JourneyByPlan {
  doneCapsule: Capsule;
  /** Open plans in journey order (the plan holding Next first), each with its own stations. */
  plans: PlanTrack[];
  /** Open tickets as stations (code `T`). */
  tickets: Station[];
  parked: Task[];
  external: Task | null;
}

/** Per-plan stations in the same order as `journey`, for the one-track-per-plan variant. */
export function journeyByPlan(ix: MapIndex, pathway: Task): JourneyByPlan {
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
    const phases = phasesOf(ix, plan).filter((p) => taskState(p) !== 'excluded');
    const stations: Station[] = [];
    for (const ph of phases) {
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
    doneCapsule: { plans: capsulePlans, units: capsulePlans.length + doneTickets },
    plans,
    tickets,
    parked,
    external,
  };
}

/**
 * The pathway as one journey: done plans in the capsule, then the plan holding Next in phase
 * order (done phases of a partly-done plan stay as done stations), then the other open plans,
 * then open tickets. Parked plans are listed, never stations.
 */
export function journey(ix: MapIndex, pathway: Task): Journey {
  const j = journeyByPlan(ix, pathway);
  return {
    doneCapsule: j.doneCapsule,
    stations: [...j.plans.flatMap((g) => g.stations), ...j.tickets],
    parked: j.parked,
    external: j.external,
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

/** The single progress number per pathway, from derive.progress(). */
export function progressLabel(ix: MapIndex, pathway: Task): ProgressLabel {
  const p = progress(ix, pathway);
  return { done: p.done, total: p.total, text: `${p.done}/${p.total}`, title: 'stages so far' };
}

/** Later stations in journey order, EXCLUDING attached inbox items (those have their own place). */
export function laterOneLiners(ix: MapIndex, pathway: Task): Station[] {
  return journey(ix, pathway).stations.filter((s) => s.state === 'later');
}

const kindRank = (k: string) => {
  const i = INBOX_ORDER.indexOf(k as InboxKind);
  return i === -1 ? INBOX_ORDER.length : i;
};

const byPriorityThenTitle = (a: Task, b: Task) =>
  priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);

/** Open inbox items attached to a pathway: bugs, features, ideas, then priority, then title. */
export function attachedInboxSorted(ix: MapIndex, pathway: Task): Task[] {
  return (ix.inPathway.get(pathway.id) ?? [])
    .filter((t) => INBOX_KINDS.has(t.kind) && !isDone(t))
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || byPriorityThenTitle(a, b));
}

export interface InboxBucket {
  /** Attached to an ACTIVE pathway (find it with `view.ix.byId.get(t.pathway_id)`). */
  attached: Task[];
  /** No pathway, a missing one, or an arrived one: nowhere else to show them. */
  unattached: Task[];
}

/** Open inbox items per kind, split attached/unattached, each sorted by priority then title. */
export function inboxByKind(view: MapView): Record<InboxKind, InboxBucket> {
  const out: Record<InboxKind, InboxBucket> = {
    bug: { attached: [], unattached: [] },
    feature: { attached: [], unattached: [] },
    idea: { attached: [], unattached: [] },
  };
  for (const t of view.ix.tasks) {
    if (!INBOX_KINDS.has(t.kind) || isDone(t)) continue;
    const pw = t.pathway_id === null ? undefined : view.ix.byId.get(t.pathway_id);
    const attached = pw !== undefined && !isDone(pw);
    out[t.kind as InboxKind][attached ? 'attached' : 'unattached'].push(t);
  }
  for (const k of INBOX_ORDER) {
    out[k].attached.sort(byPriorityThenTitle);
    out[k].unattached.sort(byPriorityThenTitle);
  }
  return out;
}
