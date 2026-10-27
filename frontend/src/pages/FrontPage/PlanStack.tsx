import type { Task } from '../../api/schemas';
import { displayTitle, plansOf, taskState, type Progress } from '../../lib/derive';
import { Openable, StatusGlyph } from './bits';
import type { MapView } from './mapView';
import { SegmentedBar } from './SegmentedBar';
import { WhatRemains } from './WhatRemains';

const finished = (t: Task) => {
  const s = taskState(t);
  return s === 'done' || s === 'excluded';
};

/**
 * A Pathway with two or more plans (owner, 2026-10-27, JB-70): each open plan on
 * its own row (name in full, its own bar, every remaining phase below it), then one grey
 * line for the finished plans.
 */
export function PlanStack({
  pathway,
  progress,
  view,
}: {
  pathway: Task;
  progress: Progress;
  view: MapView;
}) {
  const plans = plansOf(view.ix, pathway);
  const open = plans.filter((p) => !finished(p));
  const done = plans.filter(finished);
  return (
    <div className="flex flex-col gap-2" data-testid="plan-stack">
      {open.map((plan) => {
        const units = progress.units.filter((u) => u.plan.id === plan.id);
        // A phase-less plan's one unit is the plan itself, already named by the row.
        const remaining = progress.remaining.filter(
          (u) => u.plan.id === plan.id && u.task.id !== plan.id,
        );
        return (
          <section
            key={plan.id}
            aria-label={`Plan ${displayTitle(plan)}`}
            className="flex flex-col gap-1"
          >
            <Openable
              id={plan.id}
              view={view}
              as="span"
              label={plan.title}
              className="flex min-w-0 items-baseline gap-1.5 rounded px-0.5 text-[11px] font-medium"
            >
              <StatusGlyph task={plan} />
              <span className="min-w-0">{plan.title}</span>
            </Openable>
            <SegmentedBar units={units} view={view} />
            <WhatRemains remaining={remaining} view={view} cap={Infinity} />
          </section>
        );
      })}
      {done.length > 0 && (
        <p
          data-testid="plans-done"
          className="px-0.5 text-[11px] text-slate-500 dark:text-slate-400"
          title={done.map(displayTitle).join('\n')}
        >
          ✓ {done.length === 1 ? '1 plan done' : `${done.length} plans done`}
        </p>
      )}
    </div>
  );
}
