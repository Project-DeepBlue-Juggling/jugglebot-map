import clsx from 'clsx';
import type { Task } from '../../api/schemas';
import { blockedBy, blockersOf, displayTitle, isDone } from '../../lib/derive';
import { Openable } from './bits';
import type { MapView } from './mapView';

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** "blocked by X" (red while X is open) and "blocks Y" tags, each opening its item. */
export function DepTags({ task, view, max = 28 }: { task: Task; view: MapView; max?: number }) {
  const by = blockersOf(view.ix, task.id);
  const blocks = blockedBy(view.ix, task.id);
  if (by.length === 0 && blocks.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {by.map((b) => (
        <Openable
          key={`by-${b.id}`}
          id={b.id}
          view={view}
          as="span"
          className={clsx(
            'rounded px-1 text-[10px]',
            isDone(b)
              ? 'bg-slate-200 text-slate-500 line-through dark:bg-slate-700 dark:text-slate-400'
              : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
          )}
        >
          blocked by {cut(displayTitle(b), max)}
        </Openable>
      ))}
      {blocks.map((b) => (
        <Openable
          key={`blocks-${b.id}`}
          id={b.id}
          view={view}
          as="span"
          className="rounded bg-slate-200 px-1 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300"
        >
          → blocks {cut(displayTitle(b), max)}
        </Openable>
      ))}
    </span>
  );
}
