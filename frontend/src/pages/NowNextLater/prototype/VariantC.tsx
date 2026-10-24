// PROTOTYPE variant C - pathway tiles with a horizon row.
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import {
  displayTitle,
  INBOX_KINDS,
  isDone,
  lanes,
  nextStop,
  progress,
} from '../../../lib/derive';
import { kindHue } from '../../../theme/palette';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import { SegmentedBar } from '../../FrontPage/SegmentedBar';
import type { NowNextLaterViewProps } from '../NowNextLaterView';

const TAB_KINDS: ReadonlyArray<readonly [string, string]> = [
  ['idea', 'Ideas'],
  ['bug', 'Bugs'],
  ['feature', 'Feats'],
];
const MIN_TILE_W = 300;
const CAP = 3;

function Column({
  name,
  items,
  view,
  nextId,
  countOnly,
  accent,
}: {
  name: string;
  items: Task[];
  view: MapView;
  nextId: string | null;
  countOnly?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div
        className={clsx(
          'text-[10px] font-semibold uppercase',
          accent ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400',
        )}
      >
        {name} {items.length}
      </div>
      {!countOnly &&
        items.slice(0, CAP).map((t) => (
          <Openable
            key={t.id}
            id={t.id}
            view={view}
            label={displayTitle(t)}
            className={clsx(
              'line-clamp-2 rounded px-1 text-[11px] leading-snug text-slate-700 dark:text-slate-200',
              t.id === nextId && 'ring-2 ring-amber-400',
            )}
          >
            <span title={displayTitle(t)}>{displayTitle(t)}</span>
          </Openable>
        ))}
      {!countOnly && items.length > CAP && (
        <span className="px-1 text-[10px] text-slate-500 dark:text-slate-400">
          +{items.length - CAP}
        </span>
      )}
    </div>
  );
}

function Tile({ pathway, view }: { pathway: Task; view: MapView }) {
  const hue = view.hues.get(pathway.id) ?? '#64748b';
  const l = lanes(view.ix, pathway);
  const next = nextStop(view.ix, pathway);
  const nextId = next === null ? null : next.id;
  const prog = progress(view.ix, pathway);
  return (
    <section
      aria-label={pathway.title}
      className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden rounded border border-l-4 border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
      style={{ borderLeftColor: hue }}
    >
      <Openable id={pathway.id} view={view} label={pathway.title} className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">{pathway.title}</h2>
          <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
            {prog.done}/{prog.total}
          </span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {pathway.destination}
        </p>
      </Openable>
      <SegmentedBar units={prog.units} view={view} />
      <div className="mt-1 grid min-h-0 flex-1 grid-cols-4 gap-2 overflow-hidden">
        <Column name="Now" items={l.now} view={view} nextId={nextId} />
        <Column name="Next" items={l.next} view={view} nextId={nextId} accent />
        <Column name="Later" items={l.later} view={view} nextId={nextId} />
        <Column name="Done" items={l.done} view={view} nextId={nextId} countOnly />
      </div>
    </section>
  );
}

function useGrid(n: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const ro = new ResizeObserver(() => {
      setCols(Math.max(1, Math.floor(el.clientWidth / MIN_TILE_W)));
    });
    ro.observe(el);
    setCols(Math.max(1, Math.floor(el.clientWidth / MIN_TILE_W)));
    return () => ro.disconnect();
  }, []);
  const c = Math.min(cols, Math.max(n, 1));
  return { ref, cols: c, rows: Math.max(1, Math.ceil(n / c)) };
}

export function VariantC({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(() => buildMapView(tasks, deps, users, onOpen), [tasks, deps, users, onOpen]);
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const [tab, setTab] = useState('idea');
  const loose = tasks.filter(
    (t) =>
      INBOX_KINDS.has(t.kind) &&
      !isDone(t) &&
      (t.pathway_id === null || !view.ix.byId.has(t.pathway_id)),
  );
  const { ref, cols, rows } = useGrid(view.pathways.length);
  const shown = loose.filter((t) => t.kind === tab);
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div data-testid="nnl-page" className="flex h-full flex-col gap-2 overflow-hidden p-3">
        <header className="flex h-6 shrink-0 items-baseline justify-between">
          <h1 className="text-lg font-semibold">Now / Next / Later</h1>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {view.pathways.length} pathways
          </span>
        </header>
        <div className="flex min-h-0 flex-1 gap-3">
          <div
            ref={ref}
            data-testid="lanes"
            className="grid min-h-0 min-w-0 flex-1 gap-2"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {view.pathways.map((pw) => (
              <Tile key={pw.id} pathway={pw} view={view} />
            ))}
          </div>
          <DrawerSlot />
          <aside
            data-testid="rail"
            aria-label="Unattached inbox"
            className="flex w-56 shrink-0 flex-col gap-1 overflow-hidden"
          >
            <div className="flex gap-1">
              {TAB_KINDS.map(([kind, name]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setTab(kind)}
                  className={clsx(
                    'flex-1 whitespace-nowrap rounded px-1 py-0.5 text-[11px] font-semibold',
                    tab === kind
                      ? 'bg-slate-200 dark:bg-slate-700'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                  )}
                >
                  {name} {loose.filter((t) => t.kind === kind).length}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {shown.map((t) => (
                <Openable
                  key={t.id}
                  id={t.id}
                  view={view}
                  label={t.title}
                  className="truncate rounded border border-l-4 border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                  style={{ borderLeftColor: kindHue(t.kind).hex }}
                >
                  <span title={t.title}>{t.title}</span>
                </Openable>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </HoverProvider>
  );
}
