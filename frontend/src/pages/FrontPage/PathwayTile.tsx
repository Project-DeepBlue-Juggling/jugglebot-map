import type { Task } from '../../api/schemas';
import { attachedInbox, isDone, nextStop, plansOf, progress, ticketsOf } from '../../lib/derive';
import { isStale, staleAge } from '../../lib/stale';
import { kindHue } from '../../theme/palette';
import { BranchChip, Openable, Owners, PriorityTag, StaleBadge, StatusPill } from './bits';
import { FRONT_LAYOUT, type MapView } from './mapView';
import { NextBox } from './NextBox';
import { SegmentedBar } from './SegmentedBar';
import { WhatRemains } from './WhatRemains';

/** A pathway's branch chip: the pathway's own branch, else the first non-main plan branch. */
function pathwayBranch(pathway: Task, plans: Task[]): string | null {
  if (pathway.branch !== null && pathway.branch !== 'main') return pathway.branch;
  return plans.find((p) => p.branch !== null && p.branch !== 'main' && !isDone(p))?.branch ?? null;
}

/** One equal, fixed-height Front page tile. */
export function PathwayTile({ pathway, view }: { pathway: Task; view: MapView }) {
  const plans = plansOf(view.ix, pathway);
  const pr = progress(view.ix, pathway);
  const next = nextStop(view.ix, pathway);
  const tickets = ticketsOf(view.ix, pathway).filter((t) => !isDone(t)).length;
  const inbox = attachedInbox(view.ix, pathway).filter((t) => !isDone(t));
  const staleItems = inbox.filter((t) => isStale(t, view.now));
  const oldest = staleItems.reduce<Task | null>(
    (a, t) => (a === null || staleAge(t, view.now) > staleAge(a, view.now) ? t : a),
    null,
  );
  const hue = view.hues.get(pathway.id) ?? '#64748b';
  return (
    <Openable
      id={pathway.id}
      view={view}
      as="article"
      label={pathway.title}
      className="flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-md border border-l-4 border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
      style={{ height: FRONT_LAYOUT.tile, borderLeftColor: hue }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Pathway</span>
        <StatusPill task={pathway} />
        <PriorityTag priority={pathway.priority} />
        <BranchChip branch={pathwayBranch(pathway, plans)} />
        {oldest !== null && <StaleBadge count={staleItems.length} item={oldest} />}
      </div>
      <h2 className="truncate text-base font-semibold leading-tight">{pathway.title}</h2>
      <p
        className="line-clamp-3 text-[11px] leading-snug text-slate-600 dark:text-slate-300"
        title={pathway.destination}
      >
        <b className="mr-1 text-[10px] uppercase text-slate-500">Destination</b>
        {pathway.destination}
      </p>
      <SegmentedBar units={pr.units} view={view} />
      <div className="flex gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        {pr.units.length > 0 && (
          <span data-testid="stops-done">
            {pr.done} of {pr.total} stops done
          </span>
        )}
        {tickets > 0 && (
          <span>· {tickets === 1 ? '1 ticket open' : `${tickets} tickets open`}</span>
        )}
      </div>
      <NextBox pathway={pathway} next={next} hasPlans={plans.length > 0} view={view} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <WhatRemains remaining={pr.remaining} view={view} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <Owners task={pathway} view={view} />
        {inbox.map((t) => (
          <Openable
            key={t.id}
            id={t.id}
            view={view}
            as="span"
            label={t.title}
            className={`max-w-[9rem] shrink-0 truncate rounded px-1 text-[10px] ${kindHue(t.kind).chip}`}
          >
            <b>{kindHue(t.kind).label}</b> {t.title}
          </Openable>
        ))}
      </div>
    </Openable>
  );
}
