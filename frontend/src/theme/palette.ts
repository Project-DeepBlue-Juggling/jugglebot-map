import type { Task } from '../api/schemas';
import type { UnitState } from '../lib/derive';

/**
 * The map's colours, in one place. Kind hues (bug rose, feature sky, idea
 * amber), the pathway hue cycle (assigned in pathway order) and the state
 * colours used by segments, phase chips and status glyphs. Dark is the
 * default theme; every class pair carries a light and a `dark:` variant.
 */

export interface KindHue {
  label: string;
  /** Edge / pin hex (muted, readable on dark and light). */
  hex: string;
  /** Token / label classes. */
  chip: string;
}

export const KIND_HUES: Record<'bug' | 'feature' | 'idea', KindHue> = {
  bug: {
    label: 'Bug',
    hex: '#f43f5e', // rose-500
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  },
  feature: {
    label: 'Feature',
    hex: '#0ea5e9', // sky-500
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  },
  idea: {
    label: 'Idea',
    hex: '#f59e0b', // amber-500
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
};

/** Neutral style for ticket cards (a type label stands in for the kind hue). */
export const TICKET_HUE: KindHue = {
  label: 'Ticket',
  hex: '#64748b', // slate-500
  chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export function kindHue(kind: string): KindHue {
  return (KIND_HUES as Record<string, KindHue>)[kind] ?? TICKET_HUE;
}

export const KIND_LABELS: Record<string, string> = {
  pathway: 'Pathway',
  plan: 'Plan',
  phase: 'Phase',
  idea: 'Idea',
  feature: 'Feature',
  bug: 'Bug',
  ticket: 'Ticket',
};

/** The pathway hue cycle: tile edge, lane edge, pins, bar accents. */
export const PATHWAY_HUES: readonly string[] = [
  '#6366f1', // indigo-500
  '#10b981', // emerald-500
  '#e879f9', // fuchsia-400
  '#f97316', // orange-500
  '#22d3ee', // cyan-400
  '#a3e635', // lime-400
  '#f472b6', // pink-400
  '#facc15', // yellow-400
];

/** pathway id -> hue, by position in `orderedPathways` (cycling). */
export function pathwayHues(orderedPathways: readonly Task[]): Map<string, string> {
  return new Map(orderedPathways.map((p, i) => [p.id, PATHWAY_HUES[i % PATHWAY_HUES.length]]));
}

export interface StateStyle {
  label: string;
  glyph: string;
  /** Segment / phase-chip fill. */
  hex: string;
  /** Pill classes. */
  pill: string;
}

export const STATE_STYLES: Record<UnitState, StateStyle> = {
  done: {
    label: 'Done',
    glyph: '✓',
    hex: '#22c55e',
    pill: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300',
  },
  in_progress: {
    label: 'In progress',
    glyph: '●',
    hex: '#3b82f6',
    pill: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  },
  blocked: {
    label: 'Blocked',
    glyph: '⊘',
    hex: '#ef4444',
    pill: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  },
  queued: {
    label: 'Not started',
    glyph: '○',
    hex: '#64748b',
    pill: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  },
  parked: {
    label: 'Parked',
    glyph: '‖',
    hex: '#a78bfa',
    pill: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  },
  excluded: {
    label: 'Dropped',
    glyph: '–',
    hex: '#44403c',
    pill: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  },
};

/**
 * A retired phase shares `excluded` with dropped work (out of the count) but
 * is drawn as a faded done-green: it was set aside on purpose, not abandoned.
 */
export const RETIRED_STYLE: StateStyle = {
  label: 'Retired',
  glyph: '–',
  hex: '#86efac', // green-300, drawn at half opacity like every excluded segment
  pill: 'bg-green-50 text-green-700/70 dark:bg-green-950/30 dark:text-green-300/60',
};

/** The style for a task in `state`; retired phases get `RETIRED_STYLE`. */
export function stateStyle(task: Task, state: UnitState): StateStyle {
  return task.status === 'retired' ? RETIRED_STYLE : STATE_STYLES[state];
}

/** Every map status per kind (p4-common), in display order. */
export const STATUSES_BY_KIND: Record<string, readonly string[]> = {
  pathway: ['active', 'complete', 'dropped'],
  plan: ['active', 'parked', 'completed', 'archived', 'superseded', 'deferred'],
  phase: ['not_started', 'in_progress', 'complete', 'retired'],
  idea: ['inbox', 'backlog', 'in_progress', 'complete', 'dropped', 'promoted'],
  feature: ['inbox', 'backlog', 'in_progress', 'complete', 'dropped', 'promoted'],
  bug: ['inbox', 'backlog', 'in_progress', 'complete', 'dropped', 'promoted'],
  ticket: ['open', 'complete', 'dropped'],
};

/** Labels for every map status (the union over kinds). */
export const MAP_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  complete: 'Complete',
  completed: 'Completed',
  dropped: 'Dropped',
  parked: 'Parked',
  archived: 'Archived',
  superseded: 'Superseded',
  deferred: 'Deferred',
  not_started: 'Not started',
  in_progress: 'In progress',
  retired: 'Retired',
  inbox: 'Inbox',
  backlog: 'Backlog',
  promoted: 'Promoted',
  open: 'Open',
};

export function statusLabel(status: string): string {
  return MAP_STATUS_LABELS[status] ?? status;
}
