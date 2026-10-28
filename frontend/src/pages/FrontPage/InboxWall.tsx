import { useState } from 'react';
import clsx from 'clsx';
import { wallItems } from '../../lib/derive';
import {
  DEFAULT_WALL_SORT,
  isWallSort,
  WALL_SORT_KEY,
  WALL_SORT_LABELS,
  WALL_SORTS,
  type WallSort,
} from '../../lib/wallSort';
import { InboxCard } from './InboxCard';
import { FRONT_LAYOUT, type MapView } from './mapView';

function loadSort(): WallSort {
  try {
    const v = window.localStorage.getItem(WALL_SORT_KEY);
    return isWallSort(v) ? v : DEFAULT_WALL_SORT;
  } catch {
    return DEFAULT_WALL_SORT;
  }
}

function saveSort(v: WallSort): void {
  try {
    window.localStorage.setItem(WALL_SORT_KEY, v);
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}

/**
 * The wall's order as a segmented control (JB-77). Native radios under the
 * segments keep the keyboard behaviour of the new-item pills: Tab lands on the
 * chosen segment, the arrow keys move and choose.
 */
function SortControl({ value, onChange }: { value: WallSort; onChange: (v: WallSort) => void }) {
  return (
    <div className="ml-auto flex items-center gap-1.5 text-[11px] font-normal">
      <span id="wall-sort-label" className="text-slate-500 dark:text-slate-400">
        Sort
      </span>
      <div
        role="radiogroup"
        aria-labelledby="wall-sort-label"
        className="flex overflow-hidden rounded-full border border-slate-300 dark:border-slate-600"
      >
        {WALL_SORTS.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="radio"
              name="wall-sort"
              value={o}
              checked={o === value}
              onChange={() => onChange(o)}
              className="peer sr-only"
            />
            <span
              className={clsx(
                'inline-block px-2 py-0.5',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-sky-500',
                o === value
                  ? 'bg-slate-900 font-medium text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {WALL_SORT_LABELS[o]}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Every open idea / feature / bug, at full height (the page scrolls, not the wall). */
export function InboxWall({ view }: { view: MapView }) {
  const [sort, setSort] = useState<WallSort>(loadSort);
  const items = wallItems(view.ix, sort);
  const choose = (v: WallSort) => {
    setSort(v);
    saveSort(v);
  };
  return (
    <section aria-label="Inbox wall" className="flex shrink-0 flex-col">
      <div className="flex shrink-0 items-center gap-2" style={{ height: FRONT_LAYOUT.wallHead }}>
        <h2 className="flex items-baseline gap-2 text-sm font-semibold">
          Inbox wall
          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
            {items.length} open · a pin names the pathway, &quot;unattached&quot; means no home yet
          </span>
        </h2>
        <SortControl value={sort} onChange={choose} />
      </div>
      <div
        data-testid="inbox-wall"
        className="grid grid-cols-4 content-start gap-2"
        style={{ gridAutoRows: FRONT_LAYOUT.card }}
      >
        {items.map((t) => (
          <InboxCard key={t.id} task={t} view={view} />
        ))}
      </div>
    </section>
  );
}
