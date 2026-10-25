import type { Task } from '../api/schemas';
import { isDone } from './derive';

/**
 * The Done view's pure core: when a Pathway arrived or an item closed, and the
 * grouping of closed items by Pathway. No React, no clock.
 */

const MET_RE = /\bmet(?:\s+on)?\s+(\d{4}-\d{2}-\d{2})\b/i;
const PROGRESS_HEAD_RE = /^##\s+Progress\s*$/im;
const PROGRESS_LINE_RE = /^\s*(?:[-*]\s+)?(\d{4}-\d{2}-\d{2})\s*[:\-–—]/;

/**
 * The date a Pathway arrived or an item closed (`YYYY-MM-DD`):
 * (1) a "met <date>" / "met on <date>" phrase in the Destination, else
 * (2) the newest dated line of the body's `## Progress` section, else
 * (3) the `updated` date.
 */
export function completionDate(task: Task): string {
  const met = MET_RE.exec(task.destination ?? '');
  if (met !== null) return met[1];
  const progress = progressDates(task.description ?? '');
  if (progress.length > 0) return progress.reduce((a, b) => (a >= b ? a : b));
  return task.updated_at.slice(0, 10);
}

export function progressDates(body: string): string[] {
  const head = PROGRESS_HEAD_RE.exec(body);
  if (head === null) return [];
  const rest = body.slice(head.index + head[0].length);
  const next = rest.search(/^##\s/m);
  const section = next === -1 ? rest : rest.slice(0, next);
  const out: string[] = [];
  for (const line of section.split('\n')) {
    const m = PROGRESS_LINE_RE.exec(line);
    if (m !== null) out.push(m[1]);
  }
  return out;
}

/** `YYYY-MM` of a `YYYY-MM-DD`. */
export const monthOf = (date: string): string => date.slice(0, 7);

const CLOSED_KINDS: ReadonlySet<string> = new Set(['idea', 'feature', 'bug', 'ticket']);

export interface DoneOptions {
  showDropped: boolean;
  /** Restrict closed items to these kinds; empty = all. */
  kinds?: readonly string[];
  /** Restrict closed items to this `YYYY-MM`; null/absent = all. */
  month?: string | null;
}

export interface ArrivedPathway {
  pathway: Task;
  date: string;
  /** Plans whose `pathway_id` is this Pathway, by title. */
  plans: Task[];
}

export interface ClosedItem {
  task: Task;
  date: string;
}

export interface ClosedGroup {
  /** The Pathway, or null for "No Pathway". */
  pathway: Task | null;
  items: ClosedItem[];
}

const byDateDesc = (a: { date: string; task: Task }, b: { date: string; task: Task }) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : a.task.title.localeCompare(b.task.title);

const visible = (t: Task, showDropped: boolean) =>
  t.status === 'complete' || (showDropped && t.status === 'dropped');

/** Complete Pathways (dropped ones behind `showDropped`), newest arrival first. */
export function arrivedPathways(tasks: readonly Task[], showDropped: boolean): ArrivedPathway[] {
  return tasks
    .filter((t) => t.kind === 'pathway' && isDone(t) && visible(t, showDropped))
    .map((pathway) => ({
      pathway,
      date: completionDate(pathway),
      plans: tasks
        .filter((t) => t.kind === 'plan' && t.pathway_id === pathway.id)
        .sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => byDateDesc({ ...a, task: a.pathway }, { ...b, task: b.pathway }));
}

/** The Pathway an item belongs to: its `pathway_id`, else up the parent chain; null if none. */
export function pathwayOf(task: Task, byId: ReadonlyMap<string, Task>): Task | null {
  const seen = new Set<string>();
  let cur: Task | undefined = task;
  while (cur !== undefined && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.pathway_id !== null) return byId.get(cur.pathway_id) ?? null;
    cur = cur.parent_id === null ? undefined : byId.get(cur.parent_id);
    if (cur?.kind === 'pathway') return cur;
  }
  return null;
}

/** Closed idea / feature / bug / ticket items (before the kind and month filters). */
export function closedItems(tasks: readonly Task[], showDropped: boolean): ClosedItem[] {
  return tasks
    .filter((t) => CLOSED_KINDS.has(t.kind) && isDone(t) && visible(t, showDropped))
    .map((task) => ({ task, date: completionDate(task) }));
}

/** The months (`YYYY-MM`, newest first) present among closed items. */
export function closedMonths(items: readonly ClosedItem[]): string[] {
  return [...new Set(items.map((i) => monthOf(i.date)))].sort().reverse();
}

/**
 * Closed items grouped by Pathway (Pathways by their newest item, "No Pathway"
 * last), items newest first, after the kind and month filters.
 */
export function groupClosed(
  tasks: readonly Task[],
  { showDropped, kinds = [], month = null }: DoneOptions,
): ClosedGroup[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const groups = new Map<string | null, ClosedItem[]>();
  for (const it of closedItems(tasks, showDropped)) {
    if (kinds.length > 0 && !kinds.includes(it.task.kind)) continue;
    if (month !== null && monthOf(it.date) !== month) continue;
    const pw = pathwayOf(it.task, byId);
    const key = pw === null ? null : pw.id;
    const arr = groups.get(key);
    if (arr === undefined) groups.set(key, [it]);
    else arr.push(it);
  }
  const out: ClosedGroup[] = [...groups.entries()].map(([key, items]) => ({
    pathway: key === null ? null : (byId.get(key) ?? null),
    items: items.sort(byDateDesc),
  }));
  return out.sort((a, b) => {
    if ((a.pathway === null) !== (b.pathway === null)) return a.pathway === null ? 1 : -1;
    return a.items[0].date < b.items[0].date ? 1 : a.items[0].date > b.items[0].date ? -1 : 0;
  });
}
