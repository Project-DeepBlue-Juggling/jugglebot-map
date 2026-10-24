import clsx from 'clsx';
import type { Task } from '../../api/schemas';
import { displayTitle, phaseCode, phasesOf, planCardName, taskState } from '../../lib/derive';
import { STATE_STYLES, statusLabel } from '../../theme/palette';
import { BranchChip, Openable, Owners, PriorityTag, StatusGlyph } from '../FrontPage/bits';
import { DepTags } from '../FrontPage/DepTags';
import type { MapView } from '../FrontPage/mapView';

const CARD =
  'flex flex-col gap-1 rounded border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800';

/** Plan card: kind label (parked marker), short title, P1..Pn chips, owners, priority. */
export function PlanCard({ task, view }: { task: Task; view: MapView }) {
  const phases = phasesOf(view.ix, task);
  const parked = taskState(task) === 'parked';
  return (
    <Openable id={task.id} view={view} label={task.title} className={CARD}>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="font-semibold uppercase">Plan</span>
        {parked && (
          <span
            data-testid="parked-marker"
            className={clsx('rounded px-1', STATE_STYLES.parked.pill)}
          >
            ‖ parked
          </span>
        )}
        {!parked && <span>{statusLabel(task.status)}</span>}
        <PriorityTag priority={task.priority} />
        <span className="ml-auto">
          <BranchChip branch={task.branch} />
        </span>
      </div>
      <div className="line-clamp-2 text-sm font-medium leading-snug">{planCardName(task)}</div>
      {phases.length > 0 && (
        <div className="flex flex-wrap gap-0.5" data-testid="phase-chips">
          {phases.map((p) => (
            <span
              key={p.id}
              data-testid="phase-chip"
              data-state={taskState(p)}
              title={`${displayTitle(p)}: ${statusLabel(p.status)}`}
              className="rounded px-1 font-mono text-[10px] text-white"
              style={{ backgroundColor: STATE_STYLES[taskState(p)].hex }}
            >
              {phaseCode(p)}
            </span>
          ))}
        </div>
      )}
      <DepTags task={task} view={view} />
      <Owners task={task} view={view} />
    </Openable>
  );
}

/** Phase card: glyph, "Phase · <plan>", heading, two-line summary, dep tags. */
export function PhaseCard({ task, view }: { task: Task; view: MapView }) {
  const plan = task.parent_id === null ? undefined : view.ix.byId.get(task.parent_id);
  return (
    <Openable id={task.id} view={view} label={task.title} className={CARD}>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <StatusGlyph task={task} />
        <span className="truncate">Phase · {plan === undefined ? '' : planCardName(plan)}</span>
      </div>
      <div className="line-clamp-2 text-sm font-medium leading-snug">{displayTitle(task)}</div>
      {task.description !== '' && (
        <div className="line-clamp-2 text-slate-500 dark:text-slate-400">{task.description}</div>
      )}
      <DepTags task={task} view={view} />
    </Openable>
  );
}

/** Compact Done row: glyph + title. */
export function DoneRow({ task, view }: { task: Task; view: MapView }) {
  return (
    <Openable
      id={task.id}
      view={view}
      label={task.title}
      className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-[11px] text-slate-500 dark:text-slate-400"
    >
      <StatusGlyph task={task} />
      <span className="truncate">{displayTitle(task)}</span>
    </Openable>
  );
}
