import type { Task } from '../api/schemas';
import { effortRank, isBreakSized } from './metrics';

/**
 * Inbox wall orders (owner, 2026-10-28, JB-77). The viewer picks one in the
 * wall header; the choice is remembered per browser (`InboxWall`).
 *
 * - `type`: bug, feature, idea, then newest filed first within a kind.
 * - `age`: newest filed first (`created_at`), ties by id.
 * - `severity`: priority high > medium > low > none, then newest first.
 * - `effort`: xs first, unrated last, then newest first.
 */
export const WALL_SORTS = ['type', 'age', 'severity', 'effort'] as const;
export type WallSort = (typeof WALL_SORTS)[number];

export const WALL_SORT_LABELS: Record<WallSort, string> = {
  type: 'Type',
  age: 'Age',
  severity: 'Severity',
  effort: 'Effort',
};

/** localStorage key for the viewer's choice (a per-browser convenience). */
export const WALL_SORT_KEY = 'jugglebot-map-inbox-sort';

/** The order the wall opens in when nothing is remembered. */
export const DEFAULT_WALL_SORT: WallSort = 'severity';

export function isWallSort(v: unknown): v is WallSort {
  return typeof v === 'string' && (WALL_SORTS as readonly string[]).includes(v);
}

const KIND_RANK: Record<string, number> = { bug: 0, feature: 1, idea: 2 };
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function kindRank(kind: string): number {
  return KIND_RANK[kind] ?? 3;
}

function severityRank(p: string | null): number {
  return p === null ? 3 : (PRIORITY_RANK[p] ?? 3);
}

/** Milliseconds since the epoch; an unparseable date sorts as the oldest. */
function filedAt(t: Task): number {
  const ms = Date.parse(t.created_at);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/** Newest filed first, then by id so the order is total and stable. */
function byAge(a: Task, b: Task): number {
  const da = filedAt(a);
  const db = filedAt(b);
  if (da !== db) return da < db ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The comparator for one wall order. */
export function wallComparator(sort: WallSort): (a: Task, b: Task) => number {
  switch (sort) {
    case 'type':
      return (a, b) => kindRank(a.kind) - kindRank(b.kind) || byAge(a, b);
    case 'age':
      return byAge;
    case 'severity':
      return (a, b) => severityRank(a.priority) - severityRank(b.priority) || byAge(a, b);
    case 'effort':
      return (a, b) => effortRank(a.effort) - effortRank(b.effort) || byAge(a, b);
  }
}

/** The wall's optional filters (JB-77 follow-on: item metrics). */
export interface WallFilter {
  /** Only effort <= s, hardware none, owner none (and a confirmed diagnosis for a bug). */
  breakSized: boolean;
  /** Only this `area`; null = every area. */
  area: string | null;
}

export const NO_WALL_FILTER: WallFilter = { breakSized: false, area: null };

export function matchesWallFilter(t: Task, f: WallFilter): boolean {
  if (f.breakSized && !isBreakSized(t)) return false;
  return f.area === null || t.area === f.area;
}
