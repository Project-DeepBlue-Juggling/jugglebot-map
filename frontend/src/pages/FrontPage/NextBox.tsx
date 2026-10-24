import type { Task } from '../../api/schemas';
import { displayTitle, planCardName } from '../../lib/derive';
import { KIND_LABELS } from '../../theme/palette';
import { Openable, StatusGlyph } from './bits';
import type { MapView } from './mapView';

/**
 * The pathway's computed next stop. A phase names its plan; a blocker names
 * its kind. No plans: "No plans yet"; plans but nothing open (all done or
 * parked): "No open stops".
 */
export function NextBox({
  pathway,
  next,
  hasPlans,
  view,
}: {
  pathway: Task;
  next: Task | null;
  hasPlans: boolean;
  view: MapView;
}) {
  let body;
  if (next === null) {
    body = (
      <span className="text-slate-500 dark:text-slate-400">
        {!hasPlans ? 'No plans yet' : 'No open stops'}
      </span>
    );
  } else {
    const plan =
      next.kind === 'phase' && next.parent_id !== null
        ? view.ix.byId.get(next.parent_id)
        : undefined;
    const outside = next.pathway_id !== pathway.id;
    body = (
      <Openable
        id={next.id}
        view={view}
        as="span"
        className="inline-flex min-w-0 items-baseline gap-1"
      >
        <StatusGlyph task={next} />
        {outside && (
          <span className="text-[10px] uppercase text-slate-500">
            {KIND_LABELS[next.kind] ?? next.kind}
          </span>
        )}
        <span className="truncate font-medium">{displayTitle(next)}</span>
        {plan !== undefined && (
          <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
            ({planCardName(plan)})
          </span>
        )}
      </Openable>
    );
  }
  return (
    <div
      data-testid="next-box"
      className="flex min-w-0 items-baseline gap-2 rounded border border-amber-400/60 bg-amber-50 px-2 py-1 text-xs dark:border-amber-500/40 dark:bg-amber-950/30"
    >
      <b className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Next
      </b>
      {body}
    </div>
  );
}
