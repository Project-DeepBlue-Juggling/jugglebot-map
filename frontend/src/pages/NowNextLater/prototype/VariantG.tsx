// PROTOTYPE variant G (round 2): Plan tracks. A pathway is a block; each open plan inside it is
// its own track of 14 px chips (26 px pitch) with its Now/Next title and the Later one-liners
// inline. The inbox is a full-height right rail (Bugs, Features, Ideas), each item once.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import { useDrawer } from '../../../features/drawer/drawerContext';
import { displayTitle, planCardName } from '../../../lib/derive';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';
import {
  activePathways,
  attachedInboxSorted,
  INBOX_ORDER,
  inboxByKind,
  journeyByPlan,
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  TOKENS,
  type JourneyByPlan,
  type PlanTrack,
  type Station,
} from './round2.ts';
import { ArrivedShelf, KindGlyph, Legend } from './round2.tsx';

const S = TOKENS.status;
const PITCH = 26;
const NAME_W = 160;
const LATER_H = 16;
const KIND_PLURAL = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' } as const;

/** Raise `is-hovered` on every rail element of these ids (a kind badge covers several items). */
function setGroupHover(ids: readonly string[], on: boolean) {
  const want = new Set(ids);
  document.querySelectorAll('[data-item-id]').forEach((el) => {
    if (want.has(el.getAttribute('data-item-id') ?? '')) el.classList.toggle('is-hovered', on);
  });
}


function useSize<T extends HTMLElement>(): [React.RefObject<T>, number, number] {
  const ref = useRef<T>(null);
  const [sz, setSz] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => setSz([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    setSz([el.clientWidth, el.clientHeight]);
    return () => ro.disconnect();
  }, []);
  return [ref, sz[0], sz[1]];
}

/** The focus (first open) station of a track and the Later stations after it. */
function splitTrack(stations: readonly Station[]) {
  const firstOpen = stations.findIndex((s) => s.state !== 'done');
  const focus = firstOpen === -1 ? null : stations[firstOpen];
  const later = firstOpen === -1 ? [] : stations.filter((s, i) => i > firstOpen && s.state === 'later');
  return { focus, later };
}

interface Level {
  tracks: number;
  laterLines: boolean;
  h: number;
}

const trackH = (stations: readonly Station[], laterLines: boolean, compact: boolean) =>
  (compact ? 12 : 0) + 22 + (laterLines ? splitTrack(stations).later.length * LATER_H : 0);

/** Richest-to-poorest layouts of a block and the height each needs. */
function levelsOf(j: JourneyByPlan, compact: boolean): Level[] {
  const N = j.plans.length;
  const make = (tracks: number, laterLines: boolean): Level => {
    const rows: number[] = j.plans.slice(0, tracks).map((g) => trackH(g.stations, laterLines, compact));
    if (N > tracks) rows.push(18);
    if (j.tickets.length > 0) rows.push(trackH(j.tickets, laterLines, compact));
    if (j.external !== null) rows.push(18);
    if (j.parked.length > 0) rows.push(18);
    if (N === 0 && j.tickets.length === 0 && j.parked.length === 0) rows.push(18);
    return { tracks, laterLines, h: 8 + 20 + rows.reduce((a, b) => a + b, 0) + rows.length + 2 };
  };
  const out: Level[] = [make(N, true)];
  for (let t = N; t >= 1; t -= 1) out.push(make(t, false));
  return out;
}

/** A 14 px chip with the phase code inside: done filled, now filled + halo, next amber ring, later hollow. */
function Chip({ s, hue, view }: { s: Station; hue: string; view: MapView }) {
  const base: CSSProperties = {
    width: 22,
    height: 14,
    borderRadius: s.isTicket ? 2 : 7,
    fontSize: 9,
    lineHeight: '10px',
    fontWeight: 600,
  };
  let style: CSSProperties = base;
  let text: string = s.code;
  let halo = false;
  if (s.state === 'done') {
    style = {
      ...base,
      backgroundColor: TOKENS.surface,
      backgroundImage: `linear-gradient(${hue}59, ${hue}59)`,
      color: TOKENS.textMed,
    };
    text = `\u2713${s.code.length <= 2 ? s.code : ''}`;
  } else if (s.state === 'now') {
    style = { ...base, backgroundColor: hue, color: TOKENS.textHi, fontWeight: 700 };
    halo = true;
  } else if (s.state === 'next')
    style = { ...base, border: `2px solid ${S.next}`, color: S.next, backgroundColor: TOKENS.canvas };
  else if (s.state === 'blocked') {
    style = { ...base, backgroundColor: S.blocked, color: '#fff' };
    text = '\u2715';
  } else style = { ...base, border: `1.5px solid ${S.later}`, color: TOKENS.textLo, backgroundColor: TOKENS.canvas };
  return (
    <Openable
      id={s.task.id}
      view={view}
      label={displayTitle(s.task)}
      className="absolute top-0 flex items-center justify-center"
      style={{ width: PITCH, height: 22 }}
    >
      <span className="relative flex items-center justify-center">
        {halo && (
          <span
            className="absolute animate-pulse rounded-full"
            style={{ inset: -3, backgroundColor: `${hue}4d` }}
          />
        )}
        <span title={displayTitle(s.task)} className="relative flex items-center justify-center" style={style}>
          {text}
        </span>
      </span>
    </Openable>
  );
}

/** Station chips on a line; blocked stations turn the rest of the line red-dashed. */
function ChipTrack({ stations, hue, view, dashed }: { stations: readonly Station[]; hue: string; view: MapView; dashed: boolean }) {
  const n = stations.length;
  let prefix = 0;
  while (prefix < n && stations[prefix].state === 'done') prefix += 1;
  const blockedAt = stations.findIndex((s) => s.state === 'blocked');
  const xc = (i: number) => i * PITCH + PITCH / 2;
  const line = (from: number, to: number, color: string, dash: boolean): CSSProperties => ({
    left: from,
    width: Math.max(to - from, 0),
    top: 10,
    borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`,
  });
  return (
    <div className="relative shrink-0" style={{ width: n * PITCH, height: 22 }}>
      {n > 1 && <div className="absolute" style={line(xc(0), xc(n - 1), TOKENS.border, dashed)} />}
      {prefix > 1 && <div className="absolute" style={line(xc(0), xc(prefix - 1), hue, dashed)} />}
      {blockedAt !== -1 && n - 1 > blockedAt && (
        <div className="absolute" style={line(xc(blockedAt), xc(n - 1), S.blocked, true)} />
      )}
      {stations.map((s, i) => (
        <div key={s.task.id} className="absolute top-0" style={{ left: i * PITCH, width: PITCH, height: 22 }}>
          <Chip s={s} hue={hue} view={view} />
        </div>
      ))}
    </div>
  );
}

function TrackLine({
  name,
  track,
  hue,
  view,
  dashed,
  laterLines,
  compact,
}: {
  name: string;
  track: PlanTrack | null;
  hue: string;
  view: MapView;
  dashed: boolean;
  laterLines: boolean;
  compact: boolean;
}) {
  const stations = track?.stations ?? [];
  const { focus, later } = splitTrack(stations);
  // A phase-less plan's only station is the plan itself: its title would repeat the name.
  const showFocus = focus !== null && focus.task.id !== track?.plan.id;
  return (
    <div className="shrink-0">
      {compact && (
        <div className="h-3 truncate text-[10px] leading-3" style={{ color: TOKENS.textMed }} title={name}>
          {name}
        </div>
      )}
      <div className="flex h-[22px] items-center gap-2 overflow-hidden">
        {!compact && (
          <span className="shrink-0 truncate text-[11px]" style={{ color: TOKENS.textMed, width: NAME_W }} title={name}>
            {name}
          </span>
        )}
        <ChipTrack stations={stations} hue={hue} view={view} dashed={dashed} />
        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TOKENS.textLo }}>
          {showFocus && focus !== null && (
            <span style={{ color: focus.state === 'next' ? S.next : focus.state === 'blocked' ? S.blockedText : TOKENS.textHi }}>
              {displayTitle(focus.task)}
            </span>
          )}
          {!laterLines && later.length > 0 && (
            <>
              {showFocus ? '  \u00b7  ' : ''}then: {later.map((x) => displayTitle(x.task)).join(', ')}
            </>
          )}
        </span>
      </div>
      {laterLines &&
        later.map((x) => (
          <Openable
            key={x.task.id}
            id={x.task.id}
            view={view}
            label={displayTitle(x.task)}
            as="div"
            className="flex items-center truncate text-[11px]"
            style={{ height: LATER_H, paddingLeft: compact ? 0 : NAME_W + 8, color: TOKENS.textLo }}
          >
            <span className="truncate" title={displayTitle(x.task)}>
              {'\u25cb'} {displayTitle(x.task)}
            </span>
          </Openable>
        ))}
    </div>
  );
}

function Block({ view, pw, j, level, compact }: { view: MapView; pw: Task; j: JourneyByPlan; level: Level; compact: boolean }) {
  const hue = pathwayHue(view, pw.id);
  const dashed = pathwayHueReused(view, pw.id);
  const pl = progressLabel(view.ix, pw);
  const att = attachedInboxSorted(view.ix, pw);
  const shown = j.plans.slice(0, level.tracks);
  const queued = j.plans.slice(level.tracks);
  const kinds = INBOX_ORDER.map((k) => ({ k, items: att.filter((t) => t.kind === k) })).filter((x) => x.items.length > 0);
  const nothing = j.plans.length === 0 && j.tickets.length === 0;
  return (
    <section className="flex shrink-0 flex-col gap-px overflow-hidden rounded px-2 py-1" style={{ backgroundColor: TOKENS.surface }}>
      <div className="flex h-5 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap">
        <i className="inline-block h-3.5 w-[3px] shrink-0" style={{ backgroundColor: hue }} />
        <Openable id={pw.id} view={view} label={pw.title} as="span" className="min-w-0 truncate text-[13px] font-bold">
          {pw.title}
        </Openable>
        <span title={pl.title} className="shrink-0 text-[11px]" style={{ color: TOKENS.textMed }}>
          {pl.text} stages
        </span>
        {j.doneCapsule.units > 0 && (
          <span
            title={`${j.doneCapsule.units} done plan${j.doneCapsule.units > 1 ? 's' : ''}${j.doneCapsule.doneTickets > 0 ? `, ${j.doneCapsule.doneTickets} done tickets` : ''}; not drawn`}
            className="shrink-0 rounded-full px-1.5 text-[10px]"
            style={{ backgroundColor: TOKENS.raised, color: TOKENS.textMed, border: `1px solid ${TOKENS.borderStrong}` }}
          >
            {'\u2713'} {j.doneCapsule.units}{compact ? '' : ` plan${j.doneCapsule.units > 1 ? 's' : ''}`}
            {j.doneCapsule.doneTickets > 0 && !compact ? ` \u00b7 ${j.doneCapsule.doneTickets} T` : ''}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px]">
          {kinds.map(({ k, items }) => (
            <span
              key={k}
              title={`${items.length} ${k}${items.length > 1 ? 's' : ''} attached`}
              className="flex cursor-default items-center gap-0.5"
              onPointerEnter={() => setGroupHover(items.map((t) => t.id), true)}
              onPointerLeave={() => setGroupHover(items.map((t) => t.id), false)}
            >
              <KindGlyph kind={k} />
              <span style={{ color: TOKENS.textMed }}>{items.length}</span>
            </span>
          ))}
        </span>
      </div>
      {shown.map((g) => (
        <TrackLine key={g.plan.id} name={planCardName(g.plan)} track={g} hue={hue} view={view} dashed={dashed} laterLines={level.laterLines} compact={compact} />
      ))}
      {queued.length > 0 && (
        <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: TOKENS.textLo }} title={queued.map((g) => g.plan.title).join(', ')}>
          +{queued.length} queued plan{queued.length > 1 ? 's' : ''}
        </div>
      )}
      {j.tickets.length > 0 && (
        <TrackLine name="tickets" track={{ plan: pw, stations: j.tickets }} hue={hue} view={view} dashed={dashed} laterLines={level.laterLines} compact={compact} />
      )}
      {j.external !== null && (
        <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: S.next }}>
          ↗ next is outside: {displayTitle(j.external)}
        </div>
      )}
      {j.parked.length > 0 && (
        <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: TOKENS.textLo }}>
          ‖ parked: {j.parked.map((p) => p.title).join(', ')}
        </div>
      )}
      {nothing && j.parked.length === 0 && (
        <div className="h-[18px] pl-1 text-[11px]" style={{ color: TOKENS.textLo }}>
          no open plans
        </div>
      )}
    </section>
  );
}

function Rail({ view, narrow }: { view: MapView; narrow: boolean }) {
  const inbox = inboxByKind(view);
  return (
    <aside data-testid="rail" className="flex shrink-0 flex-col gap-2" style={{ width: narrow ? 232 : 340 }}>
      {INBOX_ORDER.map((k) => {
        const items = [...inbox[k].unattached, ...inbox[k].attached];
        const hex = TOKENS.kind[k].hex;
        return (
          <section
            key={k}
            className="flex min-h-[28px] flex-col overflow-hidden rounded"
            style={{ backgroundColor: TOKENS.surface, flex: `${Math.max(items.length, 1)} 1 0` }}
          >
            <header className="flex h-6 shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold uppercase" style={{ color: TOKENS.textMed }}>
              <KindGlyph kind={k} />
              {KIND_PLURAL[k]}
              <span className="font-normal" style={{ color: TOKENS.textLo }}>
                {items.length}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {items.map((t) => {
                const pw = t.pathway_id === null ? undefined : view.ix.byId.get(t.pathway_id);
                const attached = pw !== undefined && activePathways(view).some((p) => p.id === pw.id);
                return (
                  <Openable
                    key={t.id}
                    id={t.id}
                    view={view}
                    label={t.title}
                    className="flex h-[22px] items-center gap-1.5 rounded px-1 text-[12px]"
                    style={{ borderLeft: `2px solid ${hex}` }}
                  >
                    <span className="min-w-0 flex-1 truncate" title={t.title}>
                      {t.title}
                    </span>
                    {attached && pw !== undefined && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px]" style={{ color: TOKENS.textLo }}>
                        <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pathwayHue(view, pw.id) }} />
                        {!narrow && <span className="max-w-[80px] truncate">{pw.title}</span>}
                      </span>
                    )}
                  </Openable>
                );
              })}
            </div>
          </section>
        );
      })}
    </aside>
  );
}

function LegendToggle({ narrow }: { narrow: boolean }) {
  const [open, setOpen] = useState(false);
  if (!narrow) return <Legend />;
  return (
    <div className="relative" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="Legend"
        onClick={() => setOpen((o) => !o)}
        className="h-5 w-5 rounded-full text-[11px] font-semibold"
        style={{ backgroundColor: TOKENS.raised, color: TOKENS.textMed, border: `1px solid ${TOKENS.borderStrong}` }}
      >
        ?
      </button>
      {open && (
        <div
          className="absolute right-0 top-5 z-30 w-[300px] rounded p-2 [&>span]:!flex-wrap"
          style={{ backgroundColor: TOKENS.raised, border: `1px solid ${TOKENS.borderStrong}` }}
        >
          <Legend />
        </div>
      )}
    </div>
  );
}

export function VariantG({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(() => buildMapView(tasks, deps, users, onOpen), [tasks, deps, users, onOpen]);
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const drawerOpen = useDrawer()?.openId != null;
  const compact = drawerOpen;
  const [headRef, headW] = useSize<HTMLElement>();
  const [areaRef, , areaH] = useSize<HTMLDivElement>();
  const active = activePathways(view);
  const js = useMemo(() => active.map((pw) => journeyByPlan(view.ix, pw)), [view, active]);
  const lv = useMemo(() => js.map((j) => levelsOf(j, compact)), [js, compact]);
  // Water-fill: start every block at its richest layout, then degrade the tallest until it all fits.
  const idx = useMemo(() => {
    const ix = lv.map(() => 0);
    if (areaH === 0) return ix;
    const avail = areaH - 6 * Math.max(lv.length - 1, 0);
    const cur = () => lv.map((l, i) => l[ix[i]].h);
    for (;;) {
      const hs = cur();
      if (hs.reduce((a, b) => a + b, 0) <= avail) break;
      let best = -1;
      hs.forEach((h, i) => {
        if (ix[i] < lv[i].length - 1 && (best === -1 || h > hs[best])) best = i;
      });
      if (best === -1) break;
      ix[best] += 1;
    }
    return ix;
  }, [lv, areaH]);
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full gap-3 overflow-hidden p-3"
        style={{ backgroundColor: TOKENS.canvas, color: TOKENS.textHi }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <header ref={headRef} className="relative flex h-9 shrink-0 items-baseline justify-between">
            <h1 className="shrink-0 whitespace-nowrap pr-3 text-lg font-semibold">Now / Next / Later</h1>
            <LegendToggle narrow={drawerOpen || headW < 700} />
          </header>
          <div ref={areaRef} data-testid="blocks" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {active.map((pw, i) => (
              <Block key={pw.id} view={view} pw={pw} j={js[i]} level={lv[i][idx[i]]} compact={compact} />
            ))}
          </div>
          <ArrivedShelf view={view} />
        </div>
        <DrawerSlot />
        <Rail view={view} narrow={drawerOpen} />
      </div>
    </HoverProvider>
  );
}
