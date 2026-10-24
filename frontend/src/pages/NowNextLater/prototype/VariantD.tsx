// PROTOTYPE variant D - Count matrix (throwaway, never merged).
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider, useItemHover } from '../../../features/hover';
import { INBOX_KINDS, displayTitle, isDone, lanes, nextStop, progress } from '../../../lib/derive';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';

const COLS = [
  ['now', 'Now'],
  ['next', 'Next'],
  ['later', 'Later'],
  ['done', 'Done'],
] as const;
type ColKey = (typeof COLS)[number][0];

const RAIL: ReadonlyArray<readonly [string, string]> = [
  ['idea', 'Ideas'],
  ['bug', 'Bugs'],
  ['feature', 'Features'],
];

const alpha = (hex: string, a: number) =>
  hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

function TopLine({ task }: { task: Task }) {
  const hover = useItemHover(task.id);
  return (
    <span
      {...hover}
      className={clsx('block truncate text-[11px] text-slate-300', hover.className)}
      title={displayTitle(task)}
    >
      {displayTitle(task)}
    </span>
  );
}

interface Pop {
  pw: string;
  col: ColKey;
}

function Cell(props: {
  pathway: Task;
  col: ColKey;
  items: Task[];
  hue: string;
  max: number;
  ringed: boolean;
  open: boolean;
  upward: boolean;
  view: MapView;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { items, hue, max, ringed, open, upward, view } = props;
  const n = items.length;
  const heat = n === 0 ? 0 : 0.12 + 0.4 * (n / Math.max(1, max));
  return (
    <div className="relative min-h-0 min-w-0">
      <button
        type="button"
        disabled={n === 0}
        aria-label={`${props.pathway.title} ${props.col}: ${n}`}
        onClick={props.onToggle}
        className={clsx(
          'flex h-full w-full min-w-0 flex-col justify-center rounded px-2 text-left',
          n > 0 && 'cursor-pointer hover:brightness-125',
          ringed && 'ring-2 ring-amber-400',
        )}
        style={{ backgroundColor: n === 0 ? 'transparent' : alpha(hue, heat) }}
      >
        <span
          className={clsx(
            'text-lg font-semibold leading-none',
            n === 0 ? 'text-slate-800' : 'text-slate-100',
          )}
        >
          {n}
        </span>
        {n > 0 && <TopLine task={items[0]} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={props.onClose} />
          <div
            role="dialog"
            className={clsx(
              'absolute left-0 z-20 w-72 rounded border border-slate-600 bg-slate-900 p-1 shadow-xl',
              upward ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            <ul className="max-h-64 overflow-y-auto">
              {items.map((t) => (
                <li key={t.id}>
                  <Openable
                    id={t.id}
                    view={view}
                    label={t.title}
                    className="flex items-center gap-1.5 truncate rounded px-1.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <span className="text-[9px] uppercase text-slate-500">{t.kind}</span>
                    <span className="truncate">{displayTitle(t)}</span>
                  </Openable>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function RailItem({ task, view }: { task: Task; view: MapView }) {
  return (
    <Openable
      id={task.id}
      view={view}
      label={task.title}
      className="truncate rounded px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
    >
      <span title={task.title}>{task.title}</span>
    </Openable>
  );
}

export function VariantD({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const [pop, setPop] = useState<Pop | null>(null);
  const loose = tasks.filter(
    (t) =>
      INBOX_KINDS.has(t.kind) &&
      !isDone(t) &&
      (t.pathway_id === null || !view.ix.byId.has(t.pathway_id)),
  );
  const rows = view.pathways.map((pw) => ({
    pw,
    l: lanes(view.ix, pw),
    next: nextStop(view.ix, pw),
    prog: progress(view.ix, pw),
  }));
  const max = Math.max(1, ...rows.flatMap((r) => [r.l.now, r.l.next, r.l.later].map((x) => x.length)));
  const grid = { gridTemplateColumns: '10rem repeat(3, minmax(0, 1fr)) 7rem' };
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div data-testid="nnl-page" className="flex h-full flex-col gap-3 overflow-hidden p-3">
        <header className="flex h-8 shrink-0 items-baseline justify-between">
          <h1 className="text-lg font-semibold">Now / Next / Later</h1>
          <span className="text-xs text-slate-400">
            {view.pathways.length} pathways · {loose.length} unattached
          </span>
        </header>
        <div className="flex min-h-0 flex-1 gap-3">
          <aside
            data-testid="rail"
            aria-label="Unattached inbox"
            className="flex w-52 shrink-0 flex-col gap-2 overflow-y-auto"
          >
            {RAIL.map(([kind, name]) => {
              const items = loose.filter((t) => t.kind === kind);
              return (
                <section key={kind} data-testid={`rail-${kind}`}>
                  <h2 className="mb-0.5 flex items-baseline gap-1.5 text-[10px] font-semibold uppercase text-slate-400">
                    <span className="text-base text-slate-100">{items.length}</span>
                    {name}
                  </h2>
                  {items.map((t) => (
                    <RailItem key={t.id} task={t} view={view} />
                  ))}
                </section>
              );
            })}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className="grid shrink-0 gap-1 px-1 pb-1 text-[10px] font-semibold uppercase text-slate-400"
              style={grid}
            >
              <span />
              {COLS.map(([k, name]) => (
                <span key={k} className="px-2">
                  {name}
                </span>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              {rows.map(({ pw, l, next, prog }, ri) => {
                const hue = view.hues.get(pw.id) ?? '#64748b';
                const nextCol: ColKey | null =
                  next === null
                    ? null
                    : l.next.some((t) => t.id === next.id)
                      ? 'next'
                      : l.now.some((t) => t.id === next.id)
                        ? 'now'
                        : null;
                const pct = prog.total === 0 ? 0 : (prog.done / prog.total) * 100;
                return (
                  <div
                    key={pw.id}
                    data-testid="lane"
                    aria-label={pw.title}
                    className="grid min-h-0 flex-1 gap-1 rounded border border-slate-700 bg-slate-900 p-1"
                    style={grid}
                  >
                    <Openable
                      id={pw.id}
                      view={view}
                      label={pw.title}
                      className="flex min-w-0 flex-col justify-center px-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <i
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: hue }}
                        />
                        <span className="truncate text-xs font-semibold" title={pw.title}>
                          {pw.title}
                        </span>
                      </span>
                      <span className="pl-4 text-[10px] text-slate-400">
                        {prog.done} of {prog.total}
                      </span>
                    </Openable>
                    {COLS.map(([key]) =>
                      key === 'done' ? (
                        <div
                          key={key}
                          className="flex min-w-0 flex-col justify-center gap-1 px-2"
                        >
                          <span className="text-lg font-semibold leading-none text-slate-400">
                            {l.done.length}
                          </span>
                          <span className="h-1 overflow-hidden rounded bg-slate-700">
                            <span
                              className="block h-full"
                              style={{ width: `${pct}%`, backgroundColor: hue }}
                            />
                          </span>
                        </div>
                      ) : (
                        <Cell
                          key={key}
                          pathway={pw}
                          col={key}
                          items={l[key]}
                          hue={hue}
                          max={max}
                          ringed={nextCol === key}
                          open={pop !== null && pop.pw === pw.id && pop.col === key}
                          upward={ri >= rows.length / 2}
                          view={view}
                          onToggle={() =>
                            setPop((p) =>
                              p !== null && p.pw === pw.id && p.col === key
                                ? null
                                : { pw: pw.id, col: key },
                            )
                          }
                          onClose={() => setPop(null)}
                        />
                      ),
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <DrawerSlot />
        </div>
      </div>
    </HoverProvider>
  );
}
