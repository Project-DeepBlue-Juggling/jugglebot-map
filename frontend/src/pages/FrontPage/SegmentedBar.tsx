import type { ProgressUnit } from '../../lib/derive';
import { displayTitle, taskState } from '../../lib/derive';
import { STATE_STYLES, statusLabel } from '../../theme/palette';
import { useItemHover } from '../../features/hover';
import clsx from 'clsx';
import type { MapView } from './mapView';

function Segment({ unit, view }: { unit: ProgressUnit; view: MapView }) {
  const t = unit.task;
  const state = taskState(t);
  const hover = useItemHover(t.id);
  return (
    <i
      {...hover}
      data-state={state}
      title={`${displayTitle(t)} — ${statusLabel(t.status)}`}
      onClick={(e) => {
        e.stopPropagation();
        view.onOpen(t.id);
      }}
      className={clsx(
        'h-full flex-1 cursor-pointer first:rounded-l last:rounded-r',
        hover.className,
      )}
      style={{
        backgroundColor: STATE_STYLES[state].hex,
        opacity: state === 'excluded' ? 0.5 : 1,
      }}
    />
  );
}

/** One segment per progress unit, coloured by its state. */
export function SegmentedBar({ units, view }: { units: ProgressUnit[]; view: MapView }) {
  if (units.length === 0) {
    return <div aria-hidden className="h-2 rounded-sm bg-slate-200 dark:bg-slate-700/50" />;
  }
  return (
    <div className="flex h-2 gap-px" role="img" aria-label="Progress by stop">
      {units.map((u) => (
        <Segment key={u.task.id} unit={u} view={view} />
      ))}
    </div>
  );
}
