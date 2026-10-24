// PROTOTYPE round 2, variant E "Metro + ledger" (branch prototype/nnl-relayout, never merged).
// One row per active Pathway: label | metro track | horizon ledger | attached inbox. Unattached
// inbox in a three-column band underneath; the drawer docks beside the pathway area only.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../../../api/schemas';
import { useDrawer } from '../../../features/drawer/drawerContext';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import { displayTitle, progress } from '../../../lib/derive';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';
import {
  activePathways,
  attachedInboxSorted,
  inboxByKind,
  INBOX_ORDER,
  journey,
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  TOKENS,
  type InboxKind,
  type Station,
} from './round2.ts';
import { ArrivedShelf, KindGlyph, Legend, Track } from './round2.tsx';

const S = TOKENS.status;
const LINE_H = 16;
const KIND_NAME: Record<InboxKind, string> = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' };

/** Height of an element, tracked with a ResizeObserver. */
function useHeight<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

function Ledger({
  stations,
  external,
  lines,
  view,
  pathway,
}: {
  stations: readonly Station[];
  external: Task | null;
  lines: number;
  view: MapView;
  pathway: Task;
}) {
  const nows = stations.filter((s) => s.state === 'now' || s.state === 'blocked');
  const next = stations.find((s) => s.state === 'next');
  const laters = stations.filter((s) => s.state === 'later');
  type Row = { key: string; task: Task; mark: string; color: string; text: string; sub: string };
  const rows: Row[] = [];
  for (const s of nows)
    rows.push({
      key: s.task.id,
      task: s.task,
      mark: s.state === 'blocked' ? '✕' : '●',
      color: s.state === 'blocked' ? S.blockedText : TOKENS.textHi,
      text: displayTitle(s.task),
      sub: '',
    });
  if (next !== undefined)
    rows.push({
      key: next.task.id,
      task: next.task,
      mark: '◎',
      color: S.next,
      text: displayTitle(next.task),
      sub: next.plan !== null && next.plan.id !== next.task.id ? next.plan.slug : '',
    });
  else if (external !== null)
    rows.push({
      key: external.id,
      task: external,
      mark: '◎',
      color: S.next,
      text: `↗ ${displayTitle(external)}`,
      sub: 'blocker',
    });
  for (const s of laters)
    rows.push({
      key: s.task.id,
      task: s.task,
      mark: '○',
      color: TOKENS.textMed,
      text: displayTitle(s.task),
      sub: '',
    });
  const fit = Math.max(1, lines);
  const overflow = rows.length > fit;
  const shown = overflow ? rows.slice(0, fit - 1) : rows;
  const hiddenN = rows.length - shown.length;
  return (
    <div className="min-w-0" style={{ fontSize: 12, lineHeight: `${LINE_H}px` }}>
      {shown.map((r) => (
        <Openable
          key={r.key}
          id={r.task.id}
          view={view}
          label={r.text}
          className="flex items-baseline gap-1.5 rounded px-0.5"
          style={{ color: r.color, height: LINE_H }}
        >
          <span className="w-3 shrink-0 text-center" aria-hidden>
            {r.mark}
          </span>
          <span className="truncate" title={r.text}>
            {r.text}
          </span>
          {r.sub !== '' && (
            <span className="shrink-0 truncate text-[10px]" style={{ color: TOKENS.textLo, maxWidth: 110 }}>
              · {r.sub}
            </span>
          )}
        </Openable>
      ))}
      {overflow && (
        <Openable
          id={pathway.id}
          view={view}
          label={`${hiddenN} more`}
          className="flex rounded px-0.5"
          style={{ color: TOKENS.textLo, height: LINE_H }}
        >
          <span className="w-3 shrink-0" />
          <span>+{hiddenN} later</span>
        </Openable>
      )}
    </div>
  );
}

function AttachedCol({
  items,
  lines,
  view,
  collapsed,
}: {
  items: readonly Task[];
  lines: number;
  view: MapView;
  collapsed: boolean;
}) {
  if (items.length === 0) return <div />;
  const counts = INBOX_ORDER.map((k) => [k, items.filter((t) => t.kind === k).length] as const).filter(
    ([, n]) => n > 0,
  );
  const badges = (
    <span className="flex gap-1.5 text-[11px]" style={{ color: TOKENS.textMed }}>
      {counts.map(([k, n]) => (
        <span key={k} className="whitespace-nowrap">
          <KindGlyph kind={k} />
          {n}
        </span>
      ))}
    </span>
  );
  if (collapsed) return <div title={`${items.length} attached inbox items`}>{badges}</div>;
  const fit = Math.max(1, lines);
  const overflow = items.length > fit;
  const shown = overflow ? items.slice(0, fit - 1) : items;
  return (
    <div className="min-w-0 text-[12px]" style={{ lineHeight: `${LINE_H}px` }}>
      {shown.map((t) => (
        <Openable
          key={t.id}
          id={t.id}
          view={view}
          label={t.title}
          className="flex items-baseline gap-1.5 rounded px-0.5"
          style={{ height: LINE_H, color: TOKENS.textHi }}
        >
          <KindGlyph kind={t.kind} className="w-3 text-center" />
          <span className="truncate" title={t.title}>
            {t.title}
          </span>
        </Openable>
      ))}
      {overflow && (
        <div className="flex items-center gap-2 pl-4" style={{ height: LINE_H }}>
          <span style={{ color: TOKENS.textLo }}>+{items.length - shown.length}</span>
          {badges}
        </div>
      )}
    </div>
  );
}

function Row({
  pathway,
  view,
  lines,
  drawerOpen,
  cols,
}: {
  pathway: Task;
  view: MapView;
  lines: number;
  drawerOpen: boolean;
  cols: string;
}) {
  const hue = pathwayHue(view, pathway.id);
  const j = journey(view.ix, pathway);
  const pl = progressLabel(view.ix, pathway);
  const total = progress(view.ix, pathway).total;
  const att = attachedInboxSorted(view.ix, pathway);
  return (
    <section
      className="grid min-h-0 flex-1 items-center gap-3 border-t px-1"
      style={{ gridTemplateColumns: cols, borderColor: TOKENS.border }}
      data-testid="e-row"
    >
      <Openable
        id={pathway.id}
        view={view}
        label={pathway.title}
        className="min-w-0 rounded px-0.5"
        style={{ lineHeight: 1.2 }}
      >
        <div title={pathway.destination || undefined} className="flex items-start gap-1.5">
          <i className="mt-0.5 inline-block h-3.5 w-[3px] shrink-0" style={{ backgroundColor: hue }} />
          <span className="line-clamp-2 text-[13px] font-bold">{pathway.title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 pl-[9px] text-[11px]" style={{ color: TOKENS.textMed }}>
          <span title={pl.title} className="whitespace-nowrap">
            {pl.done}/{pl.total} stages
          </span>
          <span className="flex h-[3px] w-[60px] gap-px" aria-hidden>
            {Array.from({ length: Math.max(total, 1) }, (_, i) => (
              <i
                key={i}
                className="h-full flex-1"
                style={{ backgroundColor: i < pl.done ? hue : TOKENS.borderStrong }}
              />
            ))}
          </span>
        </div>
      </Openable>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <Track
          stations={j.stations}
          hue={hue}
          view={view}
          capsule={j.doneCapsule}
          external={j.external}
          dashed={pathwayHueReused(view, pathway.id)}
          maxStations={10}
        />
        {j.parked.length > 0 && (
          <span
            className="shrink-0 whitespace-nowrap text-[11px]"
            style={{ color: TOKENS.textLo }}
            title={j.parked.map((p) => p.title).join(', ')}
          >
            ‖ {j.parked.length} parked
          </span>
        )}
      </div>
      <Ledger stations={j.stations} external={j.external} lines={lines} view={view} pathway={pathway} />
      <AttachedCol items={att} lines={lines} view={view} collapsed={drawerOpen} />
    </section>
  );
}

export function VariantE({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const drawerOpen = useDrawer()?.openId != null;
  const inbox = inboxByKind(view);
  const active = activePathways(view);
  const [areaRef, areaH] = useHeight<HTMLDivElement>();
  const rowH = active.length > 0 ? areaH / active.length : areaH;
  const lines = Math.max(1, Math.floor((rowH - 8) / LINE_H));
  const cols = drawerOpen
    ? '168px minmax(300px,1fr) minmax(220px,300px) 64px'
    : '168px minmax(300px,1fr) minmax(240px,360px) minmax(180px,300px)';
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full flex-col gap-2 overflow-hidden p-3"
        style={{ backgroundColor: TOKENS.canvas, color: TOKENS.textHi }}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <header className="flex h-9 shrink-0 items-baseline justify-between">
              <h1 className="text-lg font-semibold">Now / Next / Later</h1>
              <Legend />
            </header>
            <div ref={areaRef} data-testid="lanes" className="flex min-h-0 flex-1 flex-col">
              {active.map((pw) => (
                <Row key={pw.id} pathway={pw} view={view} lines={lines} drawerOpen={drawerOpen} cols={cols} />
              ))}
            </div>
            <ArrivedShelf view={view} />
          </div>
          <DrawerSlot />
        </div>
        <div data-testid="rail" className="grid h-44 shrink-0 grid-cols-3 gap-3">
          {INBOX_ORDER.map((k) => {
            const items = inbox[k].unattached;
            return (
              <section
                key={k}
                data-testid={`rail-${k}`}
                className="flex min-h-0 flex-col rounded p-2"
                style={{ backgroundColor: TOKENS.surface }}
              >
                <h2 className="mb-1 flex shrink-0 items-baseline gap-1.5 text-[12px] font-semibold">
                  <KindGlyph kind={k} />
                  <span>{KIND_NAME[k]}</span>
                  <span style={{ color: TOKENS.kind[k].hex }}>{items.length}</span>
                  <span className="text-[10px] font-normal" style={{ color: TOKENS.textLo }}>
                    unattached
                  </span>
                </h2>
                <div className="min-h-0 flex-1 overflow-y-auto text-[12px]" style={{ lineHeight: `${LINE_H}px` }}>
                  {items.map((t) => (
                    <Openable
                      key={t.id}
                      id={t.id}
                      view={view}
                      label={t.title}
                      className="flex items-baseline gap-1.5 rounded px-0.5"
                      style={{ height: LINE_H }}
                    >
                      <KindGlyph kind={t.kind} className="w-3 text-center" />
                      <span className="truncate" title={t.title}>
                        {t.title}
                      </span>
                    </Openable>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </HoverProvider>
  );
}
