import type { DependencyEdge, Task, User } from '../../api/schemas';
import {
  buildIndex,
  openBlockers,
  orderPathways,
  taskState,
  type MapIndex,
  type UnitState,
} from '../../lib/derive';
import { pathwayHues } from '../../theme/palette';

/**
 * Everything a map card needs besides its task: the index (derive.ts), the
 * pathway order and hues, the shell's `onOpen` (opens the shared drawer) and
 * "now" for ages. Both pages build one per render with `buildMapView`.
 */
export interface MapView {
  ix: MapIndex;
  pathways: Task[];
  hues: ReadonlyMap<string, string>;
  onOpen: (taskId: string) => void;
  now: Date;
}

export function buildMapView(
  tasks: readonly Task[],
  deps: readonly DependencyEdge[],
  users: readonly User[],
  onOpen: (taskId: string) => void,
  now: Date = new Date(),
): MapView {
  const ix = buildIndex(tasks, deps, users);
  const pathways = orderPathways(tasks);
  return { ix, pathways, hues: pathwayHues(pathways), onOpen, now };
}

/** For HoverProvider: the open blocker ids of an item. */
export function openBlockerIdsOf(view: MapView): (id: string) => string[] {
  return (id) => openBlockers(view.ix, id).map((t) => t.id);
}

/** The Front page's fixed sizes in px (inline styles). The page scrolls as one, so nothing sums them. */
export const FRONT_LAYOUT = {
  pad: 12,
  mast: 32,
  tile: 276,
  gap: 12,
  wallHead: 26,
  /** One inbox card (fixed height). */
  card: 148,
} as const;

/** The state a pill shows: an active pathway reads as in progress. */
export function pillState(task: Task): UnitState {
  if (task.kind === 'pathway' && task.status === 'active') return 'in_progress';
  return taskState(task);
}

/** A short label for a link: a URL's host + last segment, a path's file name. */
export function linkLabel(link: string): string {
  try {
    const u = new URL(link);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last === undefined ? u.host : `${u.host}/…/${last}`;
  } catch {
    return link.split('/').filter(Boolean).pop() ?? link;
  }
}
