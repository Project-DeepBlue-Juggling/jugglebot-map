import type { ProgressUnit } from '../../lib/derive';
import { displayTitle } from '../../lib/derive';
import { KIND_LABELS } from '../../theme/palette';
import { Openable, StatusGlyph } from './bits';
import { DepTags } from './DepTags';
import type { MapView } from './mapView';

export const WHAT_REMAINS_CAP = 4;

/** The remaining stops, capped (four rows by default) plus "+n more". */
export function WhatRemains({
  remaining,
  view,
  cap = WHAT_REMAINS_CAP,
}: {
  remaining: ProgressUnit[];
  view: MapView;
  cap?: number;
}) {
  if (remaining.length === 0) return null;
  const shown = remaining.slice(0, cap);
  const more = remaining.length - shown.length;
  return (
    <ul className="flex min-h-0 flex-col gap-0.5 text-xs" aria-label="What remains">
      {shown.map(({ task }) => (
        <li key={task.id} className="min-w-0">
          <Openable
            id={task.id}
            view={view}
            as="span"
            className="flex min-w-0 items-baseline gap-1.5 rounded px-0.5"
          >
            <StatusGlyph task={task} />
            <span className="shrink-0 text-[10px] uppercase text-slate-500">
              {KIND_LABELS[task.kind]}
            </span>
            <span className="truncate">{displayTitle(task)}</span>
            <span className="shrink-0">
              <DepTags task={task} view={view} max={20} />
            </span>
          </Openable>
        </li>
      ))}
      {more > 0 && (
        <li className="px-0.5 text-[11px] text-slate-500 dark:text-slate-400">+{more} more</li>
      )}
    </ul>
  );
}
