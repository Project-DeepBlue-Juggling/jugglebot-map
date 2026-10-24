// PROTOTYPE variant B - slim metro: one thin line per Pathway, stations in order.
import clsx from 'clsx';
import { useMemo } from 'react';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import {
  attachedInbox,
  displayTitle,
  INBOX_KINDS,
  isDone,
  nextStop,
  progressUnits,
  taskState,
  ticketsOf,
} from '../../../lib/derive';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import { kindHue, statusLabel } from '../../../theme/palette';
import type { NowNextLaterViewProps } from '../NowNextLaterView';

const RAIL: ReadonlyArray<readonly [string, string]> = [
  ['idea', 'Ideas'],
  ['bug', 'Bugs'],
  ['feature', 'Features'],
];

function shortWords(text: string, n: number): string {
  const w = text.trim().split(/\s+/);
  return w.length <= n ? text.trim() : `${w.slice(0, n).join(' ')}…`;
}

function shortLabel(t: Task): string {
  const s = displayTitle(t);
  return s.length > 26 ? `${s.slice(0, 25)}…` : s;
}

function Station({
  task,
  view,
  x,
  hue,
  mode,
}: {
  task: Task;
  view: MapView;
  x: number;
  hue: string;
  mode: 'done' | 'now' | 'next' | 'later';
}) {
  const size = mode === 'now' ? 16 : mode === 'next' ? 14 : mode === 'done' ? 8 : 10;
  const blocked = taskState(task) === 'blocked';
  const showLabel = mode === 'now' || mode === 'next';
  return (
    <Openable
      id={task.id}
      view={view}
      label={task.title}
      className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${x}%` }}
    >
      {showLabel && (
        <span
          className={clsx(
            'absolute bottom-full mb-1 whitespace-nowrap text-[10px] font-medium',
            mode === 'next'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-slate-800 dark:text-slate-100',
          )}
        >
          {shortLabel(task)}
        </span>
      )}
      <span
        title={`${displayTitle(task)} · ${statusLabel(task.status)}`}
        className={clsx(
          'block rounded-full',
          mode === 'now' && !blocked && 'animate-pulse',
          mode === 'next' && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900',
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: mode === 'done' || mode === 'now' ? (blocked ? '#ef4444' : hue) : undefined,
          border: mode === 'later' || mode === 'next' ? `2px solid ${hue}` : undefined,
          boxShadow: mode === 'now' ? `0 0 0 4px ${hue}33` : undefined,
        }}
      />
    </Openable>
  );
}

function MetroRow({ pathway, view }: { pathway: Task; view: MapView }) {
  const hue = view.hues.get(pathway.id) ?? '#64748b';
  const ix = view.ix;
  const next = nextStop(ix, pathway);
  const stations = useMemo(() => {
    const list = [...progressUnits(ix, pathway).map((u) => u.task), ...ticketsOf(ix, pathway)];
    if (next !== null && !list.some((t) => t.id === next.id)) list.push(next);
    return list.filter((t) => taskState(t) !== 'excluded');
  }, [ix, pathway, next]);
  const n = stations.length;
  const xOf = (i: number) => ((i + 0.5) / Math.max(n, 1)) * 100;
  let lastDone = -1;
  stations.forEach((t, i) => {
    if (taskState(t) === 'done') lastDone = i;
  });
  const blocked =
    pathway.status === 'blocked' || stations.some((t) => taskState(t) === 'blocked');
  const doneX = lastDone === -1 ? 0 : xOf(lastDone);
  const inbox = attachedInbox(ix, pathway).filter((t) => !isDone(t));
  const modeOf = (t: Task): 'done' | 'now' | 'next' | 'later' => {
    const s = taskState(t);
    if (s === 'done') return 'done';
    if (next !== null && next.id === t.id && s !== 'in_progress' && s !== 'blocked') return 'next';
    if (s === 'in_progress' || s === 'blocked') return 'now';
    return 'later';
  };
  return (
    <section
      data-testid="metro-row"
      aria-label={pathway.title}
      className="flex min-h-0 flex-1 items-stretch gap-3"
    >
      <Openable
        id={pathway.id}
        view={view}
        label={pathway.title}
        className="flex w-40 shrink-0 items-center gap-2 text-sm font-semibold leading-tight"
      >
        <i aria-hidden className="h-3 w-1 shrink-0 rounded" style={{ backgroundColor: hue }} />
        <span className="line-clamp-2" title={pathway.title}>
          {pathway.title}
        </span>
      </Openable>
      <div className="relative min-w-0 flex-1">
        <div
          className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded"
          style={{ backgroundColor: `${hue}40` }}
        />
        {doneX > 0 && (
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded"
            style={{ width: `${doneX}%`, backgroundColor: hue }}
          />
        )}
        {blocked && (
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[3px] border-dashed border-red-500"
            style={{ left: `${doneX}%` }}
          />
        )}
        {stations.map((t, i) => (
          <Station key={t.id} task={t} view={view} x={xOf(i)} hue={hue} mode={modeOf(t)} />
        ))}
        <div className="absolute right-0 top-[calc(50%+10px)] flex gap-1">
          {inbox.map((t) => (
            <Openable
              key={t.id}
              id={t.id}
              view={view}
              label={t.title}
              as="span"
              className="block h-3 w-1.5 rounded-sm"
              style={{ backgroundColor: kindHue(t.kind).hex }}
            >
              <span title={`${kindHue(t.kind).label}: ${t.title}`} className="block h-full w-full" />
            </Openable>
          ))}
        </div>
      </div>
      <div
        title={pathway.destination}
        className="flex w-40 shrink-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"
      >
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-sm border-2"
          style={{ borderColor: hue }}
        />
        <span className="line-clamp-2 leading-tight">{shortWords(pathway.destination, 6)}</span>
      </div>
    </section>
  );
}

export function VariantB({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const loose = tasks.filter(
    (t) =>
      INBOX_KINDS.has(t.kind) &&
      !isDone(t) &&
      (t.pathway_id === null || !view.ix.byId.has(t.pathway_id)),
  );
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div data-testid="nnl-page" className="flex h-full flex-col gap-2 overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <header className="flex h-7 shrink-0 items-baseline justify-between">
              <h1 className="text-lg font-semibold">Now / Next / Later</h1>
              <span className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                <span>● done</span>
                <span>◉ now</span>
                <span className="text-amber-600 dark:text-amber-300">◎ next</span>
                <span>○ later</span>
                <span>▢ destination</span>
              </span>
            </header>
            <div data-testid="lanes" className="flex min-h-0 flex-1 flex-col pt-2">
              {view.pathways.map((pw) => (
                <MetroRow key={pw.id} pathway={pw} view={view} />
              ))}
            </div>
          </div>
          <DrawerSlot />
        </div>
        <aside
          data-testid="rail"
          aria-label="Unattached inbox"
          className="grid h-[170px] shrink-0 grid-cols-3 gap-3"
        >
          {RAIL.map(([kind, name]) => {
            const items = loose.filter((t) => t.kind === kind);
            const hue = kindHue(kind);
            return (
              <section
                key={kind}
                data-testid={`rail-${kind}`}
                className="flex min-h-0 flex-col rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
              >
                <h2 className="shrink-0 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {name} · {items.length}
                </h2>
                <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                  {items.map((t) => (
                    <Openable
                      key={t.id}
                      id={t.id}
                      view={view}
                      label={t.title}
                      className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-xs"
                    >
                      <i
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: hue.hex }}
                      />
                      <span className="truncate" title={t.title}>
                        {t.title}
                      </span>
                    </Openable>
                  ))}
                </div>
              </section>
            );
          })}
        </aside>
      </div>
    </HoverProvider>
  );
}
