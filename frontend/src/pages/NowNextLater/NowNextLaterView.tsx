import { useMemo } from 'react';
import type { DependencyEdge, Task, User } from '../../api/schemas';
import { HoverProvider } from '../../features/hover';
import { INBOX_KINDS, isDone } from '../../lib/derive';
import { InboxCard } from '../FrontPage/InboxCard';
import { buildMapView, openBlockerIdsOf } from '../FrontPage/mapView';
import { PathwayLane } from './Lane';

export interface NowNextLaterViewProps {
  tasks: readonly Task[];
  deps: readonly DependencyEdge[];
  users: readonly User[];
  onOpen: (taskId: string) => void;
}

const RAIL: ReadonlyArray<readonly [string, string]> = [
  ['idea', 'Ideas'],
  ['bug', 'Bugs'],
  ['feature', 'Features'],
];

/** The Now / Next / Later page: pathway swimlanes and the unattached inbox rail. */
export function NowNextLaterView({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const loose = tasks.filter(
    (t) =>
      INBOX_KINDS.has(t.kind) &&
      !isDone(t) &&
      (t.pathway_id === null || !view.ix.byId.has(t.pathway_id)),
  );
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div data-testid="nnl-page" className="flex h-full flex-col gap-3 overflow-hidden p-3">
        <header className="flex h-8 shrink-0 items-baseline justify-between">
          <h1 className="text-lg font-semibold">Now / Next / Later</h1>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {view.pathways.length} pathways · {loose.length} unattached
          </span>
        </header>
        <div className="flex min-h-0 flex-1 gap-3">
          <div data-testid="lanes" className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
            {view.pathways.map((pw) => (
              <PathwayLane key={pw.id} pathway={pw} view={view} />
            ))}
          </div>
          <aside
            data-testid="rail"
            aria-label="Unattached inbox"
            className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto"
          >
            {RAIL.map(([kind, name]) => {
              const items = loose.filter((t) => t.kind === kind);
              return (
                <section key={kind} data-testid={`rail-${kind}`} className="flex flex-col gap-1.5">
                  <h2 className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {name} · {items.length}
                  </h2>
                  {items.map((t) => (
                    <InboxCard key={t.id} task={t} view={view} />
                  ))}
                </section>
              );
            })}
          </aside>
        </div>
      </div>
    </HoverProvider>
  );
}
