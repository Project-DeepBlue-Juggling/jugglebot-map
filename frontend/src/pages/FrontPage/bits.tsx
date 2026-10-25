import clsx from 'clsx';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { Task } from '../../api/schemas';
import { taskState } from '../../lib/derive';
import { staleClock } from '../../lib/stale';
import { STATE_STYLES, statusLabel } from '../../theme/palette';
import { useItemHover } from '../../features/hover';
import { pillState, type MapView } from './mapView';

export function StatusGlyph({ task }: { task: Task }) {
  const st = STATE_STYLES[taskState(task)];
  return (
    <span
      aria-label={statusLabel(task.status)}
      title={statusLabel(task.status)}
      style={{ color: st.hex }}
    >
      {st.glyph}
    </span>
  );
}

export function StatusPill({ task }: { task: Task }) {
  return (
    <span
      className={clsx(
        'rounded px-1.5 py-px text-[10px] font-medium',
        STATE_STYLES[pillState(task)].pill,
      )}
    >
      {statusLabel(task.status)}
    </span>
  );
}

const PRIORITY_CLASS: Record<string, string> = {
  high: 'text-red-700 dark:text-red-300',
  medium: 'text-amber-700 dark:text-amber-300',
  low: 'text-slate-500 dark:text-slate-400',
};

export function PriorityTag({ priority }: { priority: string | null }) {
  if (priority === null) return null;
  return (
    <span
      title="Priority"
      className={clsx('text-[10px] font-semibold uppercase', PRIORITY_CLASS[priority])}
    >
      {priority}
    </span>
  );
}

/** A branch chip, only when the branch is set and not `main`. */
export function BranchChip({ branch }: { branch: string | null }) {
  if (branch === null || branch === '' || branch === 'main') return null;
  return (
    <span
      title="Branch"
      className="rounded bg-slate-200 px-1.5 py-px font-mono text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-200"
    >
      {branch}
    </span>
  );
}

export function Owners({ task, view }: { task: Task; view: MapView }) {
  if (task.assignee_ids.length === 0) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">unowned</span>;
  }
  return (
    <span className="flex items-center gap-1 text-[11px]">
      {task.assignee_ids.map((id) => {
        const u = view.ix.users.get(id);
        return (
          <span
            key={id}
            title={u?.display_name ?? id}
            className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-medium text-white"
            style={{ backgroundColor: u?.color ?? '#64748b' }}
          >
            {(u?.display_name ?? '?').charAt(0).toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}

export interface OpenableProps {
  id: string;
  view: MapView;
  className?: string;
  style?: CSSProperties;
  label?: string;
  children: ReactNode;
  as?: 'div' | 'span' | 'article';
}

/**
 * An element for item `id`: carries `data-item-id` and the hover classes, and
 * opens the drawer on click or Enter. Nested Openables open their own item.
 */
export function Openable({
  id,
  view,
  className,
  style,
  label,
  children,
  as = 'div',
}: OpenableProps) {
  const hover = useItemHover(id);
  const Tag = as;
  const open = () => view.onOpen(id);
  return (
    <Tag
      {...hover}
      role="button"
      tabIndex={0}
      aria-label={label}
      className={clsx('cursor-pointer', hover.className, className)}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          open();
        }
      }}
    >
      {children}
    </Tag>
  );
}

/** Muted amber, shared by the badge, the NNL ring and the Key. */
export const STALE_HEX = '#b8892f';

/**
 * "stale · N d": an open item (or, on a Pathway tile, the count of its open
 * items) with no progress past its status's threshold. Tooltip names the clock.
 */
export function StaleBadge({ days, count, item }: { days?: number; count?: number; item: Task }) {
  const text = count !== undefined ? `${count} stale` : `stale · ${days ?? 0} d`;
  return (
    <span
      data-testid="stale-badge"
      title={
        count !== undefined
          ? `no progress since ${staleClock(item)}`
          : `stale · ${days ?? 0} d: no progress since ${staleClock(item)}`
      }
      className="shrink-0 whitespace-nowrap rounded border px-1 text-[10px]"
      style={{ color: STALE_HEX, borderColor: `${STALE_HEX}66` }}
    >
      {text}
    </span>
  );
}
