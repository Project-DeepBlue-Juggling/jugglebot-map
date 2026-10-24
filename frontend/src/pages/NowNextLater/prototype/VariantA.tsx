// PROTOTYPE variant A: Horizon strips. One strip per Pathway, Done | Now | Next | Later.
import clsx from 'clsx';
import { useMemo, type ReactNode } from 'react';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import {
  attachedInbox,
  displayTitle,
  INBOX_KINDS,
  isDone,
  lanes,
  nextStop,
  progress,
  taskState,
} from '../../../lib/derive';
import { kindHue, STATE_STYLES, statusLabel } from '../../../theme/palette';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';

const RAIL: ReadonlyArray<readonly [string, string]> = [
  ['idea', 'Ideas'],
  ['bug', 'Bugs'],
  ['feature', 'Features'],
];
const COLS = 'grid-cols-[210px_96px_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_64px]';

function dotHex(t: Task): string {
  return INBOX_KINDS.has(t.kind) ? kindHue(t.kind).hex : STATE_STYLES[taskState(t)].hex;
}

function title(t: Task): string {
  return displayTitle(t);
}

/** Small dot with a hover card carrying the full title. */
function Dot({ task, view, square }: { task: Task; view: MapView; square?: boolean }) {
  return (
    <span className="group relative inline-flex">
      <Openable
        id={task.id}
        view={view}
        label={task.title}
        as="span"
        className={clsx('block h-3 w-3', square ? 'rounded-sm' : 'rounded-full')}
        style={{ backgroundColor: dotHex(task) }}
      >
        {null}
      </Openable>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-56 rounded border border-slate-600 bg-slate-950 p-1.5 text-[11px] leading-snug text-slate-100 shadow-lg group-hover:block">
        <span className="text-slate-400">
          {task.kind} · {statusLabel(task.status)}
        </span>
        <br />
        {title(task)}
      </span>
    </span>
  );
}

function Chip({
  task,
  view,
  ring,
}: {
  task: Task;
  view: MapView;
  ring?: boolean;
}) {
  const st = STATE_STYLES[taskState(task)];
  return (
    <Openable
      id={task.id}
      view={view}
      label={task.title}
      className={clsx(
        'flex min-w-0 items-center gap-1 rounded border bg-white px-1.5 py-0.5 text-[11px] dark:bg-slate-800',
        ring
          ? 'ring-2 ring-amber-400 border-amber-400'
          : 'border-slate-300 dark:border-slate-600',
      )}
    >
      <span style={{ color: st.hex }}>{st.glyph}</span>
      <span className="truncate" title={title(task)}>
        {title(task)}
      </span>
    </Openable>
  );
}

function Zone({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1 border-l border-slate-200 px-2 dark:border-slate-800">
      {children}
    </div>
  );
}

function Strip({ pathway, view }: { pathway: Task; view: MapView }) {
  const hue = view.hues.get(pathway.id) ?? '#64748b';
  const l = lanes(view.ix, pathway);
  const next = nextStop(view.ix, pathway);
  const prog = progress(view.ix, pathway);
  const pips = attachedInbox(view.ix, pathway).filter((t) => !isDone(t));
  const nowShown = l.now.slice(0, 2);
  const nextTask = next ?? l.next[0] ?? null;
  const nextInNow = nextTask !== null && l.now.some((t) => t.id === nextTask.id);
  const doneStates = l.done.slice(0, 40);
  return (
    <section
      data-testid="lane"
      aria-label={pathway.title}
      className={clsx(
        'grid min-h-[72px] flex-1 items-stretch rounded border border-slate-200 bg-slate-50',
        'dark:border-slate-700 dark:bg-slate-900',
        COLS,
      )}
    >
      <Openable
        id={pathway.id}
        view={view}
        label={pathway.title}
        className="flex min-w-0 flex-col justify-center gap-0.5 border-l-4 px-2"
        style={{ borderLeftColor: hue }}
      >
        <span className="line-clamp-2 text-sm font-semibold leading-tight">{pathway.title}</span>
        <span
          title={pathway.destination}
          className="truncate text-[11px] text-slate-500 dark:text-slate-400"
        >
          {pathway.destination}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {prog.done} of {prog.total}
        </span>
      </Openable>
      <Zone>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
            {doneStates.map((t) => (
              <span
                key={t.id}
                className="h-full flex-1 border-r border-slate-900/40"
                style={{ backgroundColor: STATE_STYLES[taskState(t)].hex, opacity: 0.8 }}
              />
            ))}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{l.done.length}</span>
        </div>
      </Zone>
      <Zone>
        {nowShown.map((t) => (
          <div key={t.id} className="min-w-0 flex-1">
            <Chip task={t} view={view} ring={nextInNow && nextTask !== null && nextTask.id === t.id} />
          </div>
        ))}
        {l.now.length > 2 && (
          <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
            +{l.now.length - 2}
          </span>
        )}
      </Zone>
      <Zone>
        {l.next.slice(0, 1).map((t) => (
          <div key={t.id} className="min-w-0 flex-1" data-isnext="true">
            <Chip task={t} view={view} ring />
          </div>
        ))}
      </Zone>
      <Zone>
        <div className="flex flex-wrap items-center gap-1">
          {l.later.slice(0, 18).map((t) => (
            <Dot key={t.id} task={t} view={view} square={INBOX_KINDS.has(t.kind)} />
          ))}
        </div>
        {l.later.length > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
            {l.later.length}
          </span>
        )}
      </Zone>
      <div className="flex flex-wrap content-center items-center justify-end gap-0.5 border-l border-slate-200 px-1.5 dark:border-slate-800">
        {pips.slice(0, 8).map((t) => (
          <span key={t.id} className="group relative inline-flex">
            <Openable
              id={t.id}
              view={view}
              label={t.title}
              as="span"
              className="block h-2 w-2 rounded-sm"
              style={{ backgroundColor: kindHue(t.kind).hex }}
            >
              {null}
            </Openable>
            <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-1 hidden w-52 rounded border border-slate-600 bg-slate-950 p-1.5 text-[11px] text-slate-100 shadow-lg group-hover:block">
              {kindHue(t.kind).label}: {t.title}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function VariantA({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
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
  const HEADS = ['', 'Done', 'Now', 'Next', 'Later', 'Inbox'];
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div data-testid="nnl-page" className="flex h-full flex-col gap-2 overflow-hidden p-3">
        <header className="flex h-7 shrink-0 items-baseline justify-between">
          <h1 className="text-lg font-semibold">Now / Next / Later</h1>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {view.pathways.length} pathways · {loose.length} unattached
          </span>
        </header>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className={clsx('grid shrink-0', COLS)}>
              {HEADS.map((h, i) => (
                <span
                  key={i}
                  className="px-2 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                >
                  {h}
                </span>
              ))}
            </div>
            <div data-testid="lanes" className="flex min-h-0 flex-1 flex-col gap-1.5">
              {view.pathways.map((pw) => (
                <Strip key={pw.id} pathway={pw} view={view} />
              ))}
            </div>
          </div>
          <DrawerSlot />
          <aside
            data-testid="rail"
            aria-label="Unattached inbox"
            className="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto"
          >
            {RAIL.map(([kind, name]) => {
              const items = loose.filter((t) => t.kind === kind);
              const hue = kindHue(kind);
              return (
                <section key={kind} data-testid={`rail-${kind}`} className="flex flex-col gap-0.5">
                  <h2 className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {name} · {items.length}
                  </h2>
                  {items.map((t) => (
                    <Openable
                      key={t.id}
                      id={t.id}
                      view={view}
                      label={t.title}
                      className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-slate-200 dark:hover:bg-slate-800"
                    >
                      <i
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: hue.hex }}
                      />
                      <span className="truncate" title={t.title}>
                        {t.title}
                      </span>
                    </Openable>
                  ))}
                </section>
              );
            })}
          </aside>
        </div>
      </div>
    </HoverProvider>
  );
}
