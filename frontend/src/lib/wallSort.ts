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

/** A wall order plus its direction; `reversed` flips the order's own key (Age: oldest first). */
export interface WallOrder {
  sort: WallSort;
  reversed: boolean;
}

export const DEFAULT_WALL_ORDER: WallOrder = { sort: DEFAULT_WALL_SORT, reversed: false };

/**
 * Read the stored choice. A bare key (the shape before directions existed)
 * means that key in its default direction; anything unknown means the default.
 */
export function parseWallOrder(raw: string | null): WallOrder {
  if (raw === null) return DEFAULT_WALL_ORDER;
  if (isWallSort(raw)) return { sort: raw, reversed: false };
  try {
    const o: unknown = JSON.parse(raw);
    if (typeof o === 'object' && o !== null) {
      const { sort, reversed } = o as { sort?: unknown; reversed?: unknown };
      if (isWallSort(sort)) return { sort, reversed: reversed === true };
    }
  } catch {
    // Not JSON: fall through to the default.
  }
  return DEFAULT_WALL_ORDER;
}

export function serializeWallOrder(o: WallOrder): string {
  return JSON.stringify({ sort: o.sort, reversed: o.reversed });
}

/** Choosing a sort: the active one flips direction, another starts in its default direction. */
export function chooseWallSort(current: WallOrder, sort: WallSort): WallOrder {
  return sort === current.sort ? { sort, reversed: !current.reversed } : { sort, reversed: false };
}

/**
 * The comparator for one wall order. `reversed` flips the primary key only:
 * age oldest first; severity low first and effort xl first; type idea,
 * feature, bug. Unrated severity / effort stay last in both directions, and
 * the newest-first tie-break inside a group is unchanged.
 */
export function wallComparator(sort: WallSort, reversed = false): (a: Task, b: Task) => number {
  const dir = reversed ? -1 : 1;
  switch (sort) {
    case 'type':
      return (a, b) => dir * (kindRank(a.kind) - kindRank(b.kind)) || byAge(a, b);
    case 'age':
      return (a, b) => {
        const da = filedAt(a);
        const db = filedAt(b);
        if (da !== db) return dir * (da < db ? 1 : -1);
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      };
    case 'severity':
      return (a, b) =>
        rated(severityRank(a.priority), severityRank(b.priority), 3, dir) || byAge(a, b);
    case 'effort':
      return (a, b) =>
        rated(effortRank(a.effort), effortRank(b.effort), effortRank(null), dir) || byAge(a, b);
  }
}

/** Compare two ranks; the unrated rank sorts last whichever way `dir` points. */
function rated(ra: number, rb: number, unrated: number, dir: number): number {
  if (ra === unrated || rb === unrated) return (ra === unrated ? 1 : 0) - (rb === unrated ? 1 : 0);
  return dir * (ra - rb);
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
