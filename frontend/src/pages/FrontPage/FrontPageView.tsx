import { useMemo } from 'react';
import type { DependencyEdge, Task, User } from '../../api/schemas';
import { HoverProvider } from '../../features/hover';
import { INBOX_KINDS, isDone } from '../../lib/derive';
import { InboxWall } from './InboxWall';
import { buildMapView, FRONT_LAYOUT, openBlockerIdsOf } from './mapView';
import { PathwayTile } from './PathwayTile';

export interface FrontPageViewProps {
  tasks: readonly Task[];
  deps: readonly DependencyEdge[];
  users: readonly User[];
  onOpen: (taskId: string) => void;
  /** The render-time clock (tests inject it); stale badges read it through the view. */
  now?: Date;
}

/** The Front page from data: masthead, the 3-column tile grid of open Pathways (a complete one is not drawn), the inbox wall. */
export function FrontPageView({ tasks, deps, users, onOpen, now }: FrontPageViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen, now),
    [tasks, deps, users, onOpen, now],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const open = view.pathways.filter((pw) => !isDone(pw));
  const plans = tasks.filter((t) => t.kind === 'plan' && t.pathway_id !== null).length;
  const inbox = tasks.filter((t) => INBOX_KINDS.has(t.kind) && !isDone(t)).length;
  const L = FRONT_LAYOUT;
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="front-page"
        className="flex h-full flex-col overflow-hidden"
        style={{ padding: L.pad, gap: L.gap }}
      >
        <header className="flex shrink-0 items-baseline justify-between" style={{ height: L.mast }}>
          <h1 className="text-lg font-semibold">Project map</h1>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {open.length} pathways · {plans} plans · {inbox} open inbox items
          </span>
        </header>
        <div
          data-testid="tile-grid"
          className="grid shrink-0 grid-cols-3 content-start overflow-y-auto"
          style={{ height: 2 * L.tile + L.gap, gap: L.gap, gridAutoRows: L.tile }}
        >
          {open.map((pw) => (
            <PathwayTile key={pw.id} pathway={pw} view={view} />
          ))}
        </div>
        <InboxWall view={view} />
      </div>
    </HoverProvider>
  );
}
