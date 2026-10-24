// PROTOTYPE round 2, variant E "Metro + ledger" (branch prototype/nnl-relayout, never merged).
// One row per active Pathway: label | metro track | horizon ledger | attached inbox. Unattached
// inbox in a three-column band underneath; the drawer docks beside the pathway area only.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../../../api/schemas';
import { useDrawer } from '../../../features/drawer/drawerContext';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import { displayTitle, planCardName, progress } from '../../../lib/derive';
import { statusLabel } from '../../../theme/palette';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';
import {
  activePathways,
  attachedInboxSorted,
  inboxByKind,
  INBOX_ORDER,
  journeyByPlan,
  donePrefix,
  type JourneyByPlan,
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  TOKENS,
  type InboxKind,
  type Station,
} from './round2.ts';
import { ArrivedShelf, KindGlyph, Legend, StationMark } from './round2.tsx';

const S = TOKENS.status;
const LINE_H = 16;
const KIND_NAME: Record<InboxKind, string> = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' };

function mergeRefs<T>(...refs: React.RefObject<T>[]) {
  return (el: T | null) => {
    for (const r of refs) (r as React.MutableRefObject<T | null>).current = el;
  };
}

/** Width of an element, tracked with a ResizeObserver. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const ro = new ResizeObserver((es) => setW(Math.round(es[es.length - 1].contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // The drawer slot fills after mount; re-read the width after every render as well as on resize.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el !== null && Math.round(el.getBoundingClientRect().width) !== w) setW(Math.round(el.getBoundingClientRect().width));
  }, [w]);
  return [ref, w];
}

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

const PITCH = 22;
const SEG_GAP = 14;
const TAG_H = 11;
const CAP_W = 34;

const planTag = (plan: Task | null): string =>
  plan === null ? 'Tickets' : (planCardName(plan).split(/\s+/)[0] ?? '');

interface Seg {
  tag: string;
  stations: Station[];
  x0: number;
}

/** Lay the segments (one per open plan, then tickets) out left to right within maxW px. */
function layoutTrack(j: JourneyByPlan, maxW: number) {
  const capW = j.doneCapsule.units > 0 ? CAP_W : 0;
  const groups = j.plans.map((g) => ({ tag: planTag(g.plan), stations: g.stations }));
  if (j.tickets.length > 0) groups.push({ tag: 'Tickets', stations: j.tickets });
  const segs: Seg[] = [];
  let x = capW;
  let left = groups.reduce((n, g) => n + g.stations.length, 0);
  let hidden = 0;
  for (const g of groups) {
    const x0 = x > capW ? x + SEG_GAP : x;
    const room = Math.floor((maxW - 30 - x0) / PITCH);
    const keep = Math.max(0, Math.min(g.stations.length, room));
    hidden += g.stations.length - keep;
    left -= g.stations.length;
    if (keep > 0) {
      segs.push({ tag: g.tag, stations: g.stations.slice(0, keep), x0 });
      x = x0 + keep * PITCH;
    }
  }
  const ext = j.external !== null && hidden === 0 && left === 0 ? 1 : 0;
  const extX = x > capW ? x + 4 : x;
  const width = ext > 0 ? extX + PITCH : x + (hidden > 0 ? 30 : 0);
  return { capW, segs, hidden, width: Math.max(width, capW), extX, ext };
}

function trackWidth(j: JourneyByPlan, maxW: number): number {
  const empty = j.plans.every((g) => g.stations.length === 0) && j.tickets.length === 0;
  return empty ? 220 : layoutTrack(j, maxW).width;
}

function ETrack({
  j,
  hue,
  view,
  maxW,
  dashed,
  selectedId,
}: {
  j: JourneyByPlan;
  hue: string;
  view: MapView;
  maxW: number;
  dashed: boolean;
  selectedId: string | null;
}) {
  const empty = j.plans.every((g) => g.stations.length === 0) && j.tickets.length === 0;
  if (empty && j.external === null && j.doneCapsule.units === 0)
    return (
      <div className="flex items-center gap-2 text-[11px]" style={{ color: TOKENS.textLo }}>
        <span className="inline-block w-[120px] border-t-2 border-dashed" style={{ borderColor: TOKENS.borderStrong }} />
        <span className="whitespace-nowrap">{j.parked.length > 0 ? 'none open' : 'no plans yet'}</span>
      </div>
    );
  const { capW, segs, hidden, width, extX, ext } = layoutTrack(j, maxW);
  const top = TAG_H;
  const lineY = top + 9;
  const line = (l: number, w: number, color: string, style = dashed ? 'dashed' : 'solid') => (
    <div className="absolute" style={{ left: l, width: Math.max(w, 0), top: lineY, borderTop: `2px ${style} ${color}` }} />
  );
  const xc = (seg: Seg, i: number) => seg.x0 + i * PITCH + PITCH / 2;
  const mark = (id: string, x: number, label: string, children: React.ReactNode, task: Task) => (
    <Openable
      key={id}
      id={id}
      view={view}
      label={label}
      className="absolute flex flex-col items-center rounded"
      style={{
        left: x - PITCH / 2,
        top,
        width: PITCH,
        boxShadow: selectedId === id ? '0 0 0 1px #fff' : undefined,
      }}
    >
      <span title={`${displayTitle(task)} · ${statusLabel(task.status)}`} className="block">
        {children}
      </span>
    </Openable>
  );
  return (
    <div className="relative shrink-0" style={{ width, height: TAG_H + 34 }} data-testid="track">
      {capW > 0 && (
        <span
          title={`${j.doneCapsule.units} done plans and ${j.doneCapsule.doneTickets} done tickets, not drawn`}
          className="absolute left-0 flex items-center rounded-full px-1.5 text-[10px] font-medium"
          style={{
            top: lineY - 8,
            height: 16,
            backgroundColor: TOKENS.raised,
            color: TOKENS.textMed,
            border: `1px solid ${TOKENS.borderStrong}`,
          }}
        >
          ✓ {j.doneCapsule.units}
          {j.doneCapsule.doneTickets > 0 ? ` · ${j.doneCapsule.doneTickets} T` : ''}
        </span>
      )}
      {segs.map((seg) => {
        const first = xc(seg, 0);
        const last = xc(seg, seg.stations.length - 1);
        const pre = Math.min(donePrefix(seg.stations), seg.stations.length);
        const blockedAt = seg.stations.findIndex((s) => s.state === 'blocked');
        return (
          <div key={seg.x0}>
            <span
              className="absolute whitespace-nowrap text-[9px] leading-[11px]"
              style={{ left: seg.x0 + 2, top: 0, color: TOKENS.textLo }}
            >
              {seg.tag}
            </span>
            {line(first, last - first, TOKENS.border)}
            {pre > 0 && line(first, xc(seg, pre - 1) - first, hue)}
            {blockedAt !== -1 && line(xc(seg, blockedAt), last - xc(seg, blockedAt), S.blocked, 'dashed')}
            {seg.stations.map((s, i) => (
              <Openable
                key={s.task.id}
                id={s.task.id}
                view={view}
                label={displayTitle(s.task)}
                className="absolute flex flex-col items-center rounded"
                style={{
                  left: xc(seg, i) - PITCH / 2,
                  top,
                  width: PITCH,
                  boxShadow: selectedId === s.task.id ? '0 0 0 1px #fff' : undefined,
                }}
              >
                <span title={`${displayTitle(s.task)} · ${statusLabel(s.task.status)}`} className="block">
                  <StationMark state={s.state} hue={hue} square={s.isTicket} />
                </span>
                <span className="text-[10px] leading-3" style={{ color: TOKENS.textLo }}>
                  {s.code}
                </span>
              </Openable>
            ))}
          </div>
        );
      })}
      {ext > 0 && j.external !== null &&
        mark(
          j.external.id,
          extX + PITCH / 2,
          displayTitle(j.external),
          <>
            <StationMark state="next" hue={hue} />
            <span className="block text-center text-[10px] leading-3" style={{ color: S.next }}>
              ↗
            </span>
          </>,
          j.external,
        )}
      {hidden > 0 && (
        <span
          className="absolute text-[10px]"
          style={{ left: width - 30, top: lineY - 6, color: TOKENS.textLo }}
          title={`${hidden} more stations`}
        >
          …+{hidden}
        </span>
      )}
    </div>
  );
}

interface LRow {
  key: string;
  task: Task;
  mark: string;
  color: string;
  text: string;
  sub: string;
}

function ledgerRows(j: JourneyByPlan, hue: string): LRow[] {
  const stations = [...j.plans.flatMap((g) => g.stations), ...j.tickets];
  const multi = j.plans.length > 1;
  const nows = stations.filter((s) => s.state === 'now' || s.state === 'blocked');
  const next = stations.find((s) => s.state === 'next');
  const laters = stations.filter((s) => s.state === 'later');
  const rows: LRow[] = [];
  for (const s of nows)
    rows.push({
      key: s.task.id,
      task: s.task,
      mark: s.state === 'blocked' ? '✕' : '●',
      color: s.state === 'blocked' ? S.blockedText : hue,
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
  else if (j.external !== null)
    rows.push({
      key: j.external.id,
      task: j.external,
      mark: '◎',
      color: S.next,
      text: `↗ ${displayTitle(j.external)}`,
      sub: 'blocker',
    });
  for (const s of laters)
    rows.push({
      key: s.task.id,
      task: s.task,
      mark: '○',
      color: TOKENS.textMed,
      text: displayTitle(s.task),
      sub: multi ? planTag(s.plan) : '',
    });
  return rows;
}

const neededLines = (j: JourneyByPlan, hue: string): number =>
  ledgerRows(j, hue).length + (j.parked.length > 0 ? 1 : 0);

function Ledger({
  j,
  hue,
  lines,
  view,
  pathway,
  selectedId,
}: {
  j: JourneyByPlan;
  hue: string;
  lines: number;
  view: MapView;
  pathway: Task;
  selectedId: string | null;
}) {
  const rows = ledgerRows(j, hue);
  const parkedRow =
    j.parked.length > 0
      ? `‖ parked: ${j.parked.map((p) => planCardName(p)).join(', ')}`
      : '';
  const total = rows.length + (parkedRow !== '' ? 1 : 0);
  const fit = Math.max(1, lines);
  const overflow = total > fit;
  const shown = overflow ? rows.slice(0, Math.max(fit - 1, 0)) : rows;
  const hiddenN = total - shown.length - (!overflow && parkedRow !== '' ? 1 : 0);
  return (
    <div className="min-w-0" style={{ fontSize: 12, lineHeight: `${LINE_H}px` }}>
      {shown.map((r) => (
        <Openable
          key={r.key}
          id={r.task.id}
          view={view}
          label={r.text}
          className="flex items-baseline gap-1.5 rounded px-0.5"
          style={{
            color: r.color,
            height: LINE_H,
            backgroundColor: selectedId === r.task.id ? TOKENS.raised : undefined,
            borderLeft: selectedId === r.task.id ? `2px solid ${TOKENS.textHi}` : undefined,
          }}
        >
          <span className="w-3 shrink-0 text-center" aria-hidden>
            {r.mark}
          </span>
          <span className="truncate" title={r.text}>
            {r.text}
          </span>
          {r.sub !== '' && (
            <span className="shrink-0 truncate text-[10px]" style={{ color: TOKENS.textLo, maxWidth: 90 }}>
              · {r.sub}
            </span>
          )}
        </Openable>
      ))}
      {!overflow && parkedRow !== '' && (
        <div className="truncate pl-[22px]" style={{ color: TOKENS.textLo, height: LINE_H }} title={parkedRow}>
          {parkedRow}
        </div>
      )}
      {overflow && (
        <Openable
          id={pathway.id}
          view={view}
          label={`${hiddenN} more`}
          className="flex rounded px-0.5"
          style={{ color: TOKENS.textLo, height: LINE_H }}
        >
          <span className="w-3 shrink-0" />
          <span>+{hiddenN} more</span>
        </Openable>
      )}
    </div>
  );
}

function Badges({ items }: { items: readonly Task[] }) {
  const counts = INBOX_ORDER.map((k) => [k, items.filter((t) => t.kind === k).length] as const).filter(
    ([, n]) => n > 0,
  );
  return (
    <span className="flex gap-1.5 text-[11px]" style={{ color: TOKENS.textMed }} title={`${items.length} attached inbox items`}>
      {counts.map(([k, n]) => (
        <span key={k} className="whitespace-nowrap">
          <KindGlyph kind={k} />
          {n}
        </span>
      ))}
    </span>
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
  cols,
  narrow,
  drawerOpen,
  trackW,
  trackMax,
  selectedId,
  grow,
}: {
  pathway: Task;
  view: MapView;
  lines: number;
  cols: string;
  narrow: boolean;
  drawerOpen: boolean;
  trackW: number;
  trackMax: number;
  selectedId: string | null;
  grow: number;
}) {
  const hue = pathwayHue(view, pathway.id);
  const j = journeyByPlan(view.ix, pathway);
  const pl = progressLabel(view.ix, pathway);
  const total = progress(view.ix, pathway).total;
  const att = attachedInboxSorted(view.ix, pathway);
  const showAtt = !narrow;
  return (
    <section
      className="grid min-h-[56px] items-center gap-3 border-t px-1"
      style={{ gridTemplateColumns: cols, borderColor: TOKENS.border, flexGrow: grow, flexBasis: 0 }}
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
          {narrow ? (
            att.length > 0 && <Badges items={att} />
          ) : (
            <span className="flex h-[3px] w-[60px] gap-px" aria-hidden>
              {Array.from({ length: Math.max(total, 1) }, (_, i) => (
                <i
                  key={i}
                  className="h-full flex-1"
                  style={{ backgroundColor: i < pl.done ? hue : TOKENS.borderStrong }}
                />
              ))}
            </span>
          )}
        </div>
      </Openable>
      <div className="flex min-w-0 items-center overflow-hidden" style={{ width: trackW }}>
        <ETrack
          j={j}
          hue={hue}
          view={view}
          maxW={trackMax}
          dashed={pathwayHueReused(view, pathway.id)}
          selectedId={selectedId}
        />
      </div>
      <Ledger j={j} hue={hue} lines={lines} view={view} pathway={pathway} selectedId={selectedId} />
      {showAtt && <AttachedCol items={att} lines={lines} view={view} collapsed={drawerOpen} />}
    </section>
  );
}

export function VariantE({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const openId = useDrawer()?.openId ?? null;
  const drawerOpen = openId !== null;
  const inbox = inboxByKind(view);
  const active = activePathways(view);
  const [areaRef, areaH] = useHeight<HTMLDivElement>();
  const [colRef, areaW] = useWidth<HTMLDivElement>();
  const narrow = drawerOpen && areaW < 820;
  const trackMax = narrow ? 250 : 420;
  const plans = active.map((pw) => {
    const j = journeyByPlan(view.ix, pw);
    return { pw, j, need: neededLines(j, pathwayHue(view, pw.id)) };
  });
  const grows = plans.map((p) => Math.max(p.need, 2));
  const gsum = grows.reduce((a, g) => a + g, 0);
  const trackW = Math.max(190, ...plans.map((p) => trackWidth(p.j, trackMax)));
  const labelW = narrow ? 150 : 168;
  const cols = narrow
    ? `${labelW}px ${trackW}px minmax(0,1fr)`
    : drawerOpen
      ? `${labelW}px ${trackW}px minmax(240px,1fr) 64px`
      : `${labelW}px ${trackW}px minmax(240px,1fr) minmax(180px,300px)`;
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full flex-col gap-2 overflow-hidden p-3"
        style={{ backgroundColor: TOKENS.canvas, color: TOKENS.textHi }}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <header className="flex h-9 shrink-0 items-baseline justify-between gap-3">
              <h1 className="shrink-0 whitespace-nowrap text-lg font-semibold">Now / Next / Later</h1>
              {areaW >= 900 && <Legend />}
            </header>
            <div ref={mergeRefs(areaRef, colRef)} data-testid="lanes" className="flex min-h-0 flex-1 flex-col">
              {plans.map((p, i) => {
                const rowH = gsum > 0 ? Math.max(56, (areaH * grows[i]) / gsum) : 56;
                return (
                  <Row
                    key={p.pw.id}
                    pathway={p.pw}
                    view={view}
                    lines={Math.max(1, Math.floor((rowH - 8) / LINE_H))}
                    cols={cols}
                    narrow={narrow}
                    drawerOpen={drawerOpen}
                    trackW={trackW}
                    trackMax={trackMax}
                    selectedId={openId}
                    grow={grows[i]}
                  />
                );
              })}
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
