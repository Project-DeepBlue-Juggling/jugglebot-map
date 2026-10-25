// PROTOTYPE variant H (round 3) = G + attached inbox one-liners inside each Pathway block + unattached-only rail + a Key panel.
// (G: Plan tracks. A pathway is a block; each open plan inside it is
// its own track of 14 px chips (26 px pitch) with its Now/Next title and the Later one-liners
// inline. The inbox is a full-height right rail (Bugs, Features, Ideas), each item once.)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  arrivedPathways,
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
import { KindGlyph } from './round2.tsx';

const S = TOKENS.status;
const PITCH = 26;
const NAME_W = 160;
const LATER_H = 16;
const LINE_H = 18;
const KEY_HEAD = 24;
const KIND_PLURAL = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' } as const;

/** The id of the item open in the drawer (null when closed). */
function useOpenId(): string | null {
  const d = useDrawer();
  return (d?.openId as string | null | undefined) ?? null;
}

const SEL: CSSProperties = { boxShadow: `0 0 0 1px ${TOKENS.textHi}` };

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
function levelsOf(j: JourneyByPlan, compact: boolean, nItems: number, listBelow: boolean): Level[] {
  const N = j.plans.length;
  const make = (tracks: number, laterLines: boolean): Level => {
    const rows: number[] = j.plans.slice(0, tracks).map((g) => trackH(g.stations, laterLines, compact));
    if (N > tracks) rows.push(18);
    if (j.tickets.length > 0) rows.push(trackH(j.tickets, laterLines, compact));
    if (j.external !== null) rows.push(18);
    if (j.parked.length > 0) rows.push(18);
    if (N === 0 && j.tickets.length === 0 && j.parked.length === 0) rows.push(18);
    const R = rows.reduce((a, b) => a + b, 0) + rows.length;
    const L = nItems * LINE_H;
    return { tracks, laterLines, h: 8 + 20 + 2 + (listBelow ? R + L : Math.max(R, L)) };
  };
  const out: Level[] = [make(N, true)];
  for (let t = N; t >= 1; t -= 1) out.push(make(t, false));
  return out;
}

/** The 14 px chip drawn by the tracks AND the Key: done filled, now filled + halo, next amber ring, later hollow. */
export function ChipMark({
  state,
  code,
  isTicket,
  hue,
  title,
  selected = false,
}: {
  state: Station['state'];
  code: string;
  isTicket: boolean;
  hue: string;
  title?: string;
  selected?: boolean;
}) {
  const base: CSSProperties = {
    width: 22,
    height: 14,
    borderRadius: isTicket ? 2 : 7,
    fontSize: 9,
    lineHeight: '10px',
    fontWeight: 600,
  };
  let style: CSSProperties = base;
  let text: string = code;
  let halo = false;
  if (state === 'done') {
    style = {
      ...base,
      backgroundColor: TOKENS.surface,
      backgroundImage: `linear-gradient(${hue}59, ${hue}59)`,
      color: TOKENS.textMed,
    };
    text = `\u2713${code.length <= 2 ? code : ''}`;
  } else if (state === 'now') {
    style = { ...base, backgroundColor: hue, color: TOKENS.textHi, fontWeight: 700 };
    halo = true;
  } else if (state === 'next')
    style = { ...base, border: `2px solid ${S.next}`, color: S.next, backgroundColor: TOKENS.canvas };
  else if (state === 'blocked') {
    style = { ...base, backgroundColor: S.blocked, color: '#fff' };
    text = '\u2715';
  } else style = { ...base, border: `1.5px solid ${S.later}`, color: TOKENS.textLo, backgroundColor: TOKENS.canvas };
  if (selected) style = { ...style, ...SEL };
  return (
    <span className="relative flex items-center justify-center">
      {halo && (
        <span className="absolute animate-pulse rounded-full" style={{ inset: -3, backgroundColor: `${hue}4d` }} />
      )}
      <span title={title} className="relative flex items-center justify-center" style={style}>
        {text}
      </span>
    </span>
  );
}

function Chip({ s, hue, view }: { s: Station; hue: string; view: MapView }) {
  const sel = useOpenId() === s.task.id;
  return (
    <Openable
      id={s.task.id}
      view={view}
      label={displayTitle(s.task)}
      className="absolute top-0 flex items-center justify-center"
      style={{ width: PITCH, height: 22 }}
    >
      <ChipMark state={s.state} code={s.code} isTicket={s.isTicket} hue={hue} title={displayTitle(s.task)} selected={sel} />
    </Openable>
  );
}

/** `done plans / tickets` capsule, used by the block header and the Key. */
export function CapsuleChip({ units, doneTickets, compact, title }: { units: number; doneTickets: number; compact: boolean; title: string }) {
  return (
    <span
      title={title}
      className="shrink-0 whitespace-nowrap rounded-full px-1.5 text-[10px]"
      style={{ backgroundColor: TOKENS.raised, color: TOKENS.textMed, border: `1px solid ${TOKENS.borderStrong}` }}
    >
      {'\u2713'} {units > 0 ? `${units}${compact ? '' : ` plan${units > 1 ? 's' : ''}`}` : `${doneTickets} T`}
      {units > 0 && doneTickets > 0 && !compact ? ` \u00b7 ${doneTickets} T` : ''}
    </span>
  );
}

function HueBar({ hue }: { hue: string }) {
  return <i className="inline-block h-3.5 w-[3px] shrink-0" style={{ backgroundColor: hue }} />;
}

function QueuedLine({ n, title }: { n: number; title?: string }) {
  return (
    <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: TOKENS.textLo }} title={title}>
      +{n} queued plan{n > 1 ? 's' : ''}
    </div>
  );
}

function ParkedLine({ text }: { text: string }) {
  return (
    <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: TOKENS.textLo }}>
      {'\u2016'} parked: {text}
    </div>
  );
}

function ExternalLine({ text }: { text: string }) {
  return (
    <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: S.next }}>
      {'\u2197'} next is outside: {text}
    </div>
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

/** The hollow-circle Later line text, used by the Later lines under tracks and by the Key. */
function LaterMark({ text, title, style }: { text: string; title?: string; style?: CSSProperties | undefined }) {
  return (
    <span className="truncate" title={title} style={style}>
      {'\u25cb'} {text}
    </span>
  );
}

/** One grey pill of the Arrived shelf; the shelf and the Key both draw it. */
function ArrivedPill({ name, label }: { name: string; label: string }) {
  return (
    <span className="flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px]" style={{ backgroundColor: TOKENS.raised, color: S.complete }}>
      <span aria-hidden>{'\u2713'}</span>
      <span>{name}</span>
      {label !== '' && <span style={{ color: TOKENS.textLo }}>{'\u00b7'} {label}</span>}
    </span>
  );
}

function Shelf({ view }: { view: MapView }) {
  const arrived = arrivedPathways(view);
  if (arrived.length === 0) return null;
  return (
    <div data-testid="arrived" className="flex h-6 shrink-0 items-center gap-2 overflow-hidden">
      <span className="text-[10px] font-semibold uppercase" style={{ color: TOKENS.textLo }}>
        Arrived
      </span>
      {arrived.map((a) => (
        <Openable key={a.pathway.id} id={a.pathway.id} view={view} label={a.pathway.title} as="span">
          <ArrivedPill name={a.pathway.title} label={a.label} />
        </Openable>
      ))}
    </div>
  );
}

function LaterLine({ x, view, compact }: { x: Station; view: MapView; compact: boolean }) {
  const sel = useOpenId() === x.task.id;
  return (
    <Openable
      id={x.task.id}
      view={view}
      label={displayTitle(x.task)}
      as="div"
      className="flex items-center truncate text-[11px]"
      style={{ height: LATER_H, paddingLeft: compact ? 0 : NAME_W + 8, color: TOKENS.textLo }}
    >
      <LaterMark text={displayTitle(x.task)} title={displayTitle(x.task)} style={sel ? SEL : undefined} />
    </Openable>
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
      {laterLines && later.map((x) => <LaterLine key={x.task.id} x={x} view={view} compact={compact} />)}
    </div>
  );
}

function ItemLine({ t, view }: { t: Task; view: MapView }) {
  const sel = useOpenId() === t.id;
  return (
    <Openable
      id={t.id}
      view={view}
      label={t.title}
      as="div"
      className="flex items-center gap-1.5 rounded px-1 text-[12px]"
      style={{ height: LINE_H, color: TOKENS.textMed, ...(sel ? SEL : {}) }}
    >
      <KindGlyph kind={t.kind} className="text-[11px]" />
      <span className="min-w-0 flex-1 truncate" title={t.title}>
        {t.title}
      </span>
    </Openable>
  );
}

function Block({
  view,
  pw,
  j,
  level,
  compact,
  listBelow,
}: {
  view: MapView;
  pw: Task;
  j: JourneyByPlan;
  level: Level;
  compact: boolean;
  listBelow: boolean;
}) {
  const hue = pathwayHue(view, pw.id);
  const dashed = pathwayHueReused(view, pw.id);
  const pl = progressLabel(view.ix, pw);
  const att = attachedInboxSorted(view.ix, pw);
  const shown = j.plans.slice(0, level.tracks);
  const queued = j.plans.slice(level.tracks);
  const nothing = j.plans.length === 0 && j.tickets.length === 0;
  const cap = j.doneCapsule;
  return (
    <section className="flex shrink-0 flex-col gap-px overflow-hidden rounded px-2 py-1" style={{ backgroundColor: TOKENS.surface }}>
      <div className="flex h-5 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap">
        <HueBar hue={hue} />
        <Openable id={pw.id} view={view} label={pw.title} as="span" className="min-w-0 truncate text-[13px] font-bold">
          {pw.title}
        </Openable>
        <span title={pl.title} className="shrink-0 text-[11px]" style={{ color: TOKENS.textMed }}>
          {pl.text} stages
        </span>
        {cap.units + cap.doneTickets > 0 && (
          <CapsuleChip
            units={cap.units}
            doneTickets={cap.doneTickets}
            compact={compact}
            title={`${cap.units} done plan${cap.units > 1 ? 's' : ''}${cap.doneTickets > 0 ? `, ${cap.doneTickets} done tickets` : ''}; not drawn`}
          />
        )}
      </div>
      <div
        className={listBelow ? 'flex flex-col gap-px' : 'grid items-start'}
        style={listBelow ? undefined : { gridTemplateColumns: 'fit-content(600px) minmax(320px, 1fr)', columnGap: 24 }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          {shown.map((g) => (
            <TrackLine key={g.plan.id} name={planCardName(g.plan)} track={g} hue={hue} view={view} dashed={dashed} laterLines={level.laterLines} compact={compact} />
          ))}
          {queued.length > 0 && <QueuedLine n={queued.length} title={queued.map((g) => g.plan.title).join(', ')} />}
          {j.tickets.length > 0 && (
            <TrackLine name="tickets" track={{ plan: pw, stations: j.tickets }} hue={hue} view={view} dashed={dashed} laterLines={level.laterLines} compact={compact} />
          )}
          {j.external !== null && <ExternalLine text={displayTitle(j.external)} />}
          {j.parked.length > 0 && <ParkedLine text={j.parked.map((p) => p.title).join(', ')} />}
          {nothing && j.parked.length === 0 && (
            <div className="h-[18px] pl-1 text-[11px]" style={{ color: TOKENS.textLo }}>
              no open plans
            </div>
          )}
        </div>
        {att.length > 0 && (
          <div data-testid="pw-items" className="flex shrink-0 flex-col" style={undefined}>
            {att.map((t) => (
              <ItemLine key={t.id} t={t} view={view} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Rail({ view, narrow }: { view: MapView; narrow: boolean }) {
  const inbox = inboxByKind(view);
  const openId = useOpenId();
  return (
    <aside data-testid="rail" className="flex shrink-0 flex-col gap-2" style={{ width: narrow ? 232 : 300 }}>
      {INBOX_ORDER.map((k) => {
        const shownIds = new Set(activePathways(view).map((p) => p.id));
        // Unattached, plus any item whose Pathway is not drawn as a block (so each item still appears once).
        const items = [...inbox[k].unattached, ...inbox[k].attached.filter((t) => !shownIds.has(t.pathway_id ?? ''))];
        const hex = TOKENS.kind[k].hex;
        return (
          <section
            key={k}
            className="flex flex-col overflow-hidden rounded"
            style={{
              backgroundColor: TOKENS.surface,
              flex: items.length === 0 ? '0 0 auto' : `${items.length} 1 0`,
              minHeight: items.length === 0 ? KEY_HEAD : KEY_HEAD + 3 * 22,
            }}
          >
            <header className="flex h-6 shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold uppercase" style={{ color: TOKENS.textMed }}>
              <KindGlyph kind={k} />
              {KIND_PLURAL[k]} {'\u00b7'} no Pathway
              <span className="font-normal" style={{ color: TOKENS.textLo }}>
                {items.length}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {items.map((t) => (
                <Openable
                  key={t.id}
                  id={t.id}
                  view={view}
                  label={t.title}
                  className="flex min-h-[22px] items-center rounded px-1 py-0.5 text-[12px] leading-4"
                  style={{ borderLeft: `2px solid ${hex}`, ...(openId === t.id ? SEL : {}) }}
                >
                  <span className="line-clamp-2 min-w-0 flex-1" title={t.title}>
                    {t.title}
                  </span>
                  {t.pathway_id !== null && view.ix.byId.get(t.pathway_id) !== undefined && (
                    <span className="ml-1 max-w-[70px] shrink-0 truncate text-[10px]" style={{ color: TOKENS.textLo }}>
                      {view.ix.byId.get(t.pathway_id)?.title}
                    </span>
                  )}
                </Openable>
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}

const KEY_STORE = 'nnl-key-open';

/** One Key entry: sample mark (drawn by the same function the page uses) + bold term + a few words. */
function KeyEntry({ mark, term, text }: { mark: React.ReactNode; term: string; text: string }) {
  return (
    <div className="flex min-h-[18px] items-start gap-1.5 text-[11px] leading-[18px]" style={{ color: TOKENS.textMed }}>
      <span className="flex shrink-0 items-center justify-center" style={{ height: 18, minWidth: 34 }}>
        {mark}
      </span>
      <span className="min-w-0">
        <b style={{ color: TOKENS.textHi }}>{term}</b> {text}
      </span>
    </div>
  );
}

function KeyGroup({ label, grow, children }: { label: string; grow: number; children: React.ReactNode }) {
  return (
    <div className="min-w-[200px]" style={{ flex: `${grow} 1 0` }}>
      <div className="h-3.5 text-[10px] font-semibold uppercase leading-[14px]" style={{ color: TOKENS.textLo }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function KeyBody({ wide, view, caps }: { wide: boolean; view: MapView; caps: { tickets: [number, number]; plans: [number, number] } }) {
  const hue = TOKENS.pathwayHues[0];
  const st = (state: Station['state'], code: string, isTicket = false) => (
    <ChipMark state={state} code={code} isTicket={isTicket} hue={hue} />
  );
  const prog = progressLabel(view.ix, activePathways(view)[0] ?? ({} as Task));
  return (
    <div className={`flex gap-x-4 pb-1.5 ${wide ? '' : 'flex-wrap'}`}>
          <KeyGroup label="Stages (chips on the tracks)" grow={1.5}>
            <KeyEntry mark={st('done', 'P1')} term="done" text="finished; consecutive done chips are joined by a line" />
            <KeyEntry mark={st('now', 'P2')} term="now" text="in progress; its name follows the chips in white" />
            <KeyEntry mark={st('next', 'P3')} term="next" text="the one stage to pick up next, across all Pathways; its name follows the chips in amber" />
            <KeyEntry mark={st('later', 'P4')} term="later" text="queued" />
            <KeyEntry mark={<span className="flex w-full justify-center text-[11px]" style={{ color: TOKENS.textLo }}>{'\u25cb'}</span>} term="later stage" text="queued, one line each under the track" />
            <KeyEntry mark={st('blocked', 'P5')} term="blocked" text="waiting on another item" />
            <KeyEntry mark={st('later', 'T', true)} term="T" text="a ticket (square chip)" />
          </KeyGroup>
          <KeyGroup label="Plans and tallies" grow={1.4}>
            <KeyEntry mark={st('later', 'BSS')} term="BSS" text="a plan without phases (its initials)" />
            <KeyEntry mark={<CapsuleChip units={caps.tickets[0]} doneTickets={caps.tickets[1]} compact={false} title="" />} term="finished tickets" text="done tickets, not drawn" />
            <KeyEntry mark={<CapsuleChip units={caps.plans[0]} doneTickets={caps.plans[1]} compact={false} title="" />} term="finished plans" text="done plans and tickets, not drawn" />
            <KeyEntry mark={<span style={{ color: TOKENS.textLo }}>{'\u2016'}</span>} term="parked" text="deliberately not now" />
            <KeyEntry mark={<span style={{ color: TOKENS.textLo }}>+2</span>} term="queued plans" text="plans not drawn at this size" />
            <KeyEntry mark={<span style={{ color: S.next }}>{'\u2197'}</span>} term="outside" text="the next stop is in another Pathway" />
          </KeyGroup>
          <KeyGroup label="Pathway and inbox" grow={1.5}>
            <KeyEntry mark={<HueBar hue={hue} />} term="colour bar" text="the Pathway's colour" />
            <KeyEntry
              mark={<span style={{ color: TOKENS.textMed }}>{prog.text}</span>}
              term="stages"
              text="finished of all planned (2/7 = two of seven)"
            />
            <KeyEntry mark={<ArrivedPill name="Pathway" label="date" />} term="Arrived" text="shelf at the bottom: completed Pathways" />
            <KeyEntry
              mark={
                <span className="flex gap-0.5">
                  <KindGlyph kind="bug" />
                  <KindGlyph kind="feature" />
                  <KindGlyph kind="idea" />
                </span>
              }
              term="bug, feature, idea"
              text="listed in their Pathway; unattached ones in the right-hand column"
            />
            <KeyEntry mark={<span className="is-hovered rounded px-1 text-[10px]" style={{ color: TOKENS.textMed }}>P2</span>} term="hover" text="lights up the same item elsewhere; click opens it" />
          </KeyGroup>
        </div>
  );
}

type Caps = { tickets: [number, number]; plans: [number, number] };

/** The Key: inline when it fits under the blocks; otherwise an upward overlay opened from its header (Esc or header click closes). */
function Key({
  open,
  overlay,
  onToggle,
  fits,
  wide,
  view,
  maxH,
  caps,
}: {
  open: boolean;
  overlay: boolean;
  onToggle: () => void;
  fits: boolean;
  wide: boolean;
  view: MapView;
  maxH: number;
  caps: Caps;
}) {
  const inline = fits && open;
  const floating = !fits && overlay;
  useEffect(() => {
    if (!floating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [floating, onToggle]);
  return (
    <section data-testid="key" className="relative shrink-0 rounded px-2" style={{ backgroundColor: TOKENS.surface }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={inline || floating}
        className="flex h-6 w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase"
        style={{ color: TOKENS.textMed }}
      >
        <span aria-hidden>{inline || floating ? '\u25be' : '\u25b8'}</span>
        Key
      </button>
      {inline && <KeyBody wide={wide} view={view} caps={caps} />}
      {floating && (
        <div
          data-testid="key-overlay"
          className="absolute bottom-6 left-0 right-0 z-30 overflow-y-auto rounded px-2 pt-1"
          style={{ backgroundColor: TOKENS.raised, border: `1px solid ${TOKENS.border}`, maxHeight: maxH }}
        >
          <KeyBody wide={wide} view={view} caps={caps} />
        </div>
      )}
    </section>
  );
}

export function VariantH({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(() => buildMapView(tasks, deps, users, onOpen), [tasks, deps, users, onOpen]);
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const drawerOpen = useDrawer()?.openId != null;
  const [areaRef, areaW, areaH] = useSize<HTMLDivElement>();
  const compact = drawerOpen || (areaW > 0 && areaW < 760);
  const [measRef, , keyBody] = useSize<HTMLDivElement>();
  const [keyOpen, setKeyOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(KEY_STORE) !== '0';
    } catch {
      return true;
    }
  });
  const [overlay, setOverlay] = useState(false);
  const toggleKey = () =>
    setKeyOpen((o) => {
      try {
        window.localStorage.setItem(KEY_STORE, o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  const active = activePathways(view);
  const caps = useMemo((): Caps => {
    const all = active.map((pw) => journeyByPlan(view.ix, pw).doneCapsule);
    const t = all.find((c) => c.units === 0 && c.doneTickets > 0);
    const p = all.find((c) => c.units > 0);
    return {
      tickets: t ? [0, t.doneTickets] : [0, 17],
      plans: p ? [p.units, p.doneTickets] : [3, 14],
    };
  }, [view, active]);
  const listBelow = drawerOpen || (areaW > 0 && areaW < 800);
  const js = useMemo(() => active.map((pw) => journeyByPlan(view.ix, pw)), [view, active]);
  const nItems = useMemo(() => active.map((pw) => attachedInboxSorted(view.ix, pw).length), [view, active]);
  const lv = useMemo(() => js.map((j, i) => levelsOf(j, compact, nItems[i], listBelow)), [js, compact, nItems, listBelow]);
  // Water-fill: start every block at its richest layout, then degrade the tallest until it all fits.
  const [idx, free] = useMemo((): [number[], number] => {
    const ix = lv.map(() => 0);
    if (areaH === 0) return [ix, 0];
    const avail = areaH - 6 * Math.max(lv.length, 0) - KEY_HEAD;
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
    return [ix, avail - cur().reduce((a, b) => a + b, 0)];
  }, [lv, areaH]);
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full gap-3 overflow-hidden p-3"
        style={{ backgroundColor: TOKENS.canvas, color: TOKENS.textHi }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <header className="flex h-9 shrink-0 items-baseline justify-between">
            <h1 className="shrink-0 whitespace-nowrap pr-3 text-lg font-semibold">Now / Next / Later</h1>
          </header>
          <div ref={areaRef} data-testid="blocks" className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            <div ref={measRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-full">
              <KeyBody wide={areaW >= 860 && !drawerOpen} view={view} caps={caps} />
            </div>
            {active.map((pw, i) => (
              <Block key={pw.id} view={view} pw={pw} j={js[i]} level={lv[i][idx[i]]} compact={compact} listBelow={listBelow} />
            ))}
            <div className="mt-auto">
              <Key
                open={keyOpen}
                overlay={overlay}
                onToggle={() => (free >= keyBody ? toggleKey() : setOverlay((o) => !o))}
                fits={free >= keyBody}
                wide={areaW >= 860 && !drawerOpen}
                view={view}
                maxH={Math.max(areaH - 40, 100)}
                caps={caps}
              />
            </div>
          </div>
          <Shelf view={view} />
        </div>
        <DrawerSlot />
        <Rail view={view} narrow={drawerOpen} />
      </div>
    </HoverProvider>
  );
}
