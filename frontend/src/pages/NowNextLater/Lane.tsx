import type { ReactNode } from 'react';
import type { Task } from '../../api/schemas';
import { lanes, nextStop } from '../../lib/derive';
import { InboxCard, TicketCard } from '../FrontPage/InboxCard';
import { BranchChip, Openable, Owners, PriorityTag, StatusPill } from '../FrontPage/bits';
import type { MapView } from '../FrontPage/mapView';
import { DoneRow, PhaseCard, PlanCard } from './Cards';

const COLUMNS = [
  ['now', 'Now'],
  ['next', 'Next'],
  ['later', 'Later'],
  ['done', 'Done'],
] as const;

function card(t: Task, view: MapView): ReactNode {
  if (t.kind === 'plan') return <PlanCard task={t} view={view} />;
  if (t.kind === 'phase') return <PhaseCard task={t} view={view} />;
  if (t.kind === 'ticket') return <TicketCard task={t} view={view} />;
  return <InboxCard task={t} view={view} />;
}

/** One pathway swimlane: header plus Now / Next / Later / Done. */
export function PathwayLane({ pathway, view }: { pathway: Task; view: MapView }) {
  const hue = view.hues.get(pathway.id) ?? '#64748b';
  const l = lanes(view.ix, pathway);
  const next = nextStop(view.ix, pathway);
  return (
    <section
      data-testid="lane"
      aria-label={pathway.title}
      className="shrink-0 rounded border border-l-4 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
      style={{ borderLeftColor: hue }}
    >
      <Openable
        id={pathway.id}
        view={view}
        label={pathway.title}
        className="flex items-center gap-2 px-2 py-1.5"
      >
        <h2 className="text-sm font-semibold">{pathway.title}</h2>
        <StatusPill task={pathway} />
        <PriorityTag priority={pathway.priority} />
        <BranchChip branch={pathway.branch} />
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
          {pathway.destination}
        </span>
        <Owners task={pathway} view={view} />
      </Openable>
      <div className="grid grid-cols-4 gap-2 px-2 pb-2">
        {COLUMNS.map(([key, name]) => (
          <div key={key} data-testid={`col-${key}`} className="flex min-w-0 flex-col gap-1.5">
            <h3 className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
              {name} · {l[key].length}
            </h3>
            {l[key].map((t) =>
              key === 'done' ? (
                <DoneRow key={t.id} task={t} view={view} />
              ) : (
                <div
                  key={t.id}
                  data-isnext={next !== null && next.id === t.id ? 'true' : undefined}
                  className={
                    next !== null && next.id === t.id ? 'rounded ring-2 ring-amber-400' : undefined
                  }
                >
                  {card(t, view)}
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
