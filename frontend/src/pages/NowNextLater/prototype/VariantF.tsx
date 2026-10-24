// PROTOTYPE round 2, variant F "Kind grid" (branch prototype/nnl-relayout, never merged):
// pathway rows x (Later | Bugs | Features | Ideas) columns, an Unattached row, the Arrived shelf.
// "The inbox is just another row": every item appears exactly once.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import { displayTitle } from '../../../lib/derive';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';
import {
  activePathways,
  donePrefix,
  inboxByKind,
  INBOX_ORDER,
  journey,
  laterOneLiners,
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  TOKENS,
  type Capsule,
  type InboxKind,
  type Station,
} from './round2.ts';
import { ArrivedShelf, KindGlyph, Legend, StationMark } from './round2.tsx';

const T = TOKENS;
const KIND_NAME: Record<InboxKind, string> = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' };
const LINE = 15;
const PITCH = 14;
const UNATTACHED_H = 160;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Compact metro line: 14 px pitch, small marks, no codes (Tracks of round2.tsx are 22 px pitch). */
function MiniTrack({
  stations,
  hue,
  view,
  capsule,
  dashed,
  max,
}: {
  stations: readonly Station[];
  hue: string;
  view: MapView;
  capsule: Capsule;
  dashed: boolean;
  max: number;
}) {
  const shown = stations.slice(0, max);
  const hidden = stations.length - shown.length;
  const capW = capsule.units > 0 ? 30 : 0;
  const xOf = (i: number) => capW + i * PITCH + PITCH / 2;
  const prefix = Math.min(donePrefix(stations), shown.length);
  const lineEnd = shown.length > 0 ? xOf(shown.length - 1) : capW;
  const fillEnd = prefix > 0 ? xOf(prefix - 1) : capW;
  const blockedAt = shown.findIndex((s) => s.state === 'blocked');
  const style = (from: number, to: number, color: string, dash = dashed): CSSProperties => ({
    position: 'absolute',
    left: from,
    width: Math.max(to - from, 0),
    top: 6,
    borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`,
  });
  return (
    <div className="relative flex shrink-0 items-center" style={{ height: 14 }} data-testid="mini-track">
      <div style={style(capW > 0 ? 0 : xOf(0), lineEnd, T.border)} />
      {fillEnd > 0 && <div style={style(capW > 0 ? 0 : xOf(0), fillEnd, hue)} />}
      {blockedAt !== -1 && <div style={style(xOf(blockedAt), lineEnd, T.status.blocked, true)} />}
      {capW > 0 && (
        <span
          title={`${capsule.units} done, not drawn`}
          className="absolute left-0 flex items-center rounded-full px-1 text-[9px] leading-[12px]"
          style={{ top: 1, backgroundColor: T.raised, color: T.textMed, border: `1px solid ${T.borderStrong}` }}
        >
          ✓ {capsule.units}
        </span>
      )}
      {shown.map((s, i) => (
        <Openable
          key={s.task.id}
          id={s.task.id}
          view={view}
          label={displayTitle(s.task)}
          className="absolute top-0 rounded"
          style={{ left: xOf(i) - PITCH / 2, width: PITCH, height: 14 }}
        >
          <span title={`${displayTitle(s.task)} · ${s.state}`} className="flex justify-center">
            <StationMark state={s.state} hue={hue} square={s.isTicket} size={14} />
          </span>
        </Openable>
      ))}
      {hidden > 0 && (
        <span
          className="absolute text-[9px]"
          style={{ left: xOf(shown.length - 1) + PITCH, top: 0, color: T.textLo }}
          title={`${hidden} more stations`}
        >
          …+{hidden}
        </span>
      )}
    </div>
  );
}

function Cell({ children, style, className = '' }: { children?: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div
      className={`min-h-0 min-w-0 overflow-hidden px-2 py-1 ${className}`}
      style={{ backgroundColor: T.surface, ...style }}
    >
      {children}
    </div>
  );
}

/** One line: glyph + title; HIGH priority gets a 2 px left rule in the kind hue. */
function ItemLine({ task, view }: { task: Task; view: MapView }) {
  const k = T.kind[task.kind as InboxKind];
  return (
    <Openable
      id={task.id}
      view={view}
      label={task.title}
      className="flex items-center gap-1 truncate rounded-sm pl-1 text-[11px]"
      style={{
        height: LINE,
        color: T.textHi,
        borderLeft: task.priority === 'high' ? `2px solid ${k.hex}` : '2px solid transparent',
      }}
    >
      <KindGlyph kind={task.kind} className="text-[9px]" />
      <span className="truncate" title={task.title}>
        {task.title}
      </span>
    </Openable>
  );
}

/** As many lines as fit, then `+n`. Every item is rendered at most once (no duplicates across cells). */
function ItemList({ items, cap, view }: { items: readonly Task[]; cap: number; view: MapView }) {
  const room = Math.max(cap, 1);
  const overflow = items.length > room;
  const shown = overflow ? items.slice(0, room - 1) : items;
  return (
    <>
      {shown.map((t) => (
        <ItemLine key={t.id} task={t} view={view} />
      ))}
      {overflow && (
        <span className="pl-2 text-[10px]" style={{ color: T.textLo }} title={items.slice(room - 1).map((t) => t.title).join('\n')}>
          +{items.length - (room - 1)}
        </span>
      )}
    </>
  );
}

export function VariantF({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const inbox = inboxByKind(view);
  const pathways = activePathways(view);

  const rowsRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 600 });
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (el === null) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rowH = size.h / Math.max(pathways.length, 1);
  const cap = Math.max(1, Math.floor((rowH - 6) / LINE));
  const merged = rowH < 68; // lines 3 and 4 merge into one
  const narrow = size.w < 896; // drawer open: Ideas collapses to a count column
  const maxStations = Math.max(4, Math.floor((350 - 30) / PITCH));

  const total = (k: InboxKind) => inbox[k].attached.length + inbox[k].unattached.length;
  const maxTotal = Math.max(1, ...INBOX_ORDER.map(total));
  const fr = (k: InboxKind) => clamp(0.6 + (total(k) / maxTotal) * 0.8, 0.6, 1.4).toFixed(2);
  const cols = `380px minmax(200px,1.2fr) ${fr('bug')}fr ${fr('feature')}fr ${
    narrow ? '56px' : `${(Number(fr('idea')) * 0.8).toFixed(2)}fr`
  }`;
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: cols,
    gap: 1,
    backgroundColor: T.border,
  };

  const attachedOf = (pw: Task, k: InboxKind) => inbox[k].attached.filter((t) => t.pathway_id === pw.id);
  const kindCell = (items: readonly Task[], k: InboxKind, c: number) =>
    narrow && k === 'idea' ? (
      <Cell
        className="text-center text-[11px]"
        style={{ color: T.kind.idea.hex }}
      >
        <span title={items.map((t) => t.title).join('\n')}>
          {items.length > 0 ? `◇ ${items.length}` : ''}
        </span>
      </Cell>
    ) : (
      <Cell>
        <ItemList items={items} cap={c} view={view} />
      </Cell>
    );

  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full flex-col gap-2 overflow-hidden p-3"
        style={{ backgroundColor: T.canvas, color: T.textHi }}
      >
        <header className="flex h-7 shrink-0 items-baseline justify-between">
          <h1 className="text-lg font-semibold">Now / Next / Later</h1>
          <Legend />
        </header>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div data-testid="lanes" className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ backgroundColor: T.border, gap: 1 }}>
              <div style={{ ...gridStyle, height: 28 }} className="shrink-0">
                {['Pathway', 'Later', ...INBOX_ORDER.map((k) => `${KIND_NAME[k]} ${total(k)}`)].map((h, i) => {
                  const k = i >= 2 ? INBOX_ORDER[i - 2] : null;
                  const label = narrow && k === 'idea' ? `◇ ${total('idea')}` : h;
                  return (
                    <Cell key={h} className="flex items-center text-[11px] font-semibold uppercase" style={{ color: k !== null ? T.kind[k].hex : T.textMed }}>
                      {k !== null && !(narrow && k === 'idea') && <KindGlyph kind={k} className="mr-1" />}
                      {label}
                    </Cell>
                  );
                })}
              </div>
              <div ref={rowsRef} className="flex min-h-0 flex-1 flex-col" style={{ gap: 1 }}>
                {pathways.map((pw) => {
                  const j = journey(view.ix, pw);
                  const pl = progressLabel(view.ix, pw);
                  const hue = pathwayHue(view, pw.id);
                  const later = laterOneLiners(view.ix, pw);
                  const nows = j.stations.filter((s) => s.state === 'now' || s.state === 'blocked');
                  const nextSt = j.stations.find((s) => s.state === 'next');
                  const nextTask = nextSt?.task ?? j.external;
                  const nowText = nows.length > 0 ? nows.map((s) => displayTitle(s.task)).join(' · ') : null;
                  return (
                    <div key={pw.id} className="min-h-0 flex-1" style={gridStyle}>
                      <Cell className="flex flex-col justify-center gap-px">
                        <Openable
                          id={pw.id}
                          view={view}
                          label={pw.title}
                          className="flex items-baseline gap-1 truncate text-[13px] font-bold leading-4"
                        >
                          <i className="inline-block h-3 w-[3px] shrink-0 self-center" style={{ backgroundColor: hue }} />
                          <span className="truncate">{pw.title}</span>
                          <span title={pl.title} className="shrink-0 text-[11px] font-normal" style={{ color: T.textMed }}>
                            {pl.text}
                          </span>
                        </Openable>
                        <MiniTrack
                          stations={j.stations}
                          hue={hue}
                          view={view}
                          capsule={j.doneCapsule}
                          dashed={pathwayHueReused(view, pw.id)}
                          max={maxStations}
                        />
                        {merged ? (
                          (nowText !== null || nextTask !== null) && (
                            <div className="truncate text-[11px] leading-[14px]" style={{ color: nowText !== null ? T.textHi : T.status.next }}>
                              {nowText !== null
                                ? <>{nows[0].state === 'blocked' ? '✕' : '●'} {nowText}</>
                                : <>◎ {j.external !== null && nextSt === undefined ? '↗ ' : ''}{displayTitle(nextTask as Task)}</>}
                            </div>
                          )
                        ) : (
                          <>
                            {nowText !== null && (
                              <div className="truncate text-[11px] leading-[14px]" style={{ color: nows[0].state === 'blocked' ? T.status.blockedText : T.textHi }}>
                                <span style={{ color: nows[0].state === 'blocked' ? T.status.blocked : hue }}>{nows[0].state === 'blocked' ? '✕' : '●'}</span> {nowText}
                              </div>
                            )}
                            {nextTask !== null && (
                              <div className="truncate text-[11px] leading-[14px]" style={{ color: T.status.next }}>
                                ◎ {j.external !== null && nextSt === undefined ? '↗ ' : ''}{displayTitle(nextTask)}
                              </div>
                            )}
                          </>
                        )}
                      </Cell>
                      <Cell>
                        {(() => {
                          const tail = j.parked.length > 0 ? 1 : 0;
                          const fits = later.length + tail <= cap;
                          const nShow = fits ? later.length : Math.max(cap - tail - 1, 0);
                          const more = later.length - nShow;
                          return (
                            <>
                              {later.slice(0, nShow).map((s) => (
                                <Openable
                                  key={s.task.id}
                                  id={s.task.id}
                                  view={view}
                                  label={displayTitle(s.task)}
                                  className="flex items-center gap-1 truncate rounded-sm text-[11px]"
                                  style={{ height: LINE, color: T.textMed }}
                                >
                                  <span style={{ color: T.status.later }}>○</span>
                                  <span className="truncate">{displayTitle(s.task)}</span>
                                </Openable>
                              ))}
                              {(more > 0 || tail > 0) && (
                                <div className="text-[10px]" style={{ color: T.textLo, height: LINE }}>
                                  {more > 0 ? `+${more}` : ''}
                                  {more > 0 && tail > 0 ? ' · ' : ''}
                                  {tail > 0 ? `‖ ${j.parked.length} parked` : ''}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </Cell>
                      {INBOX_ORDER.map((k) => (
                        <div key={k} className="contents">{kindCell(attachedOf(pw, k), k, cap)}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ ...gridStyle, height: UNATTACHED_H }} className="shrink-0">
                <Cell className="flex flex-col justify-center">
                  <span className="text-[13px] font-bold">Unattached</span>
                  <span className="text-[11px]" style={{ color: T.textMed }}>
                    {INBOX_ORDER.reduce((n, k) => n + inbox[k].unattached.length, 0)} items, no pathway
                  </span>
                </Cell>
                <Cell />
                {INBOX_ORDER.map((k) => (
                  <Cell key={k} className="!overflow-y-auto">
                    {narrow && k === 'idea' ? (
                      <span className="text-[11px]" style={{ color: T.kind.idea.hex }} title={inbox.idea.unattached.map((t) => t.title).join('\n')}>
                        {inbox.idea.unattached.length > 0 ? `◇ ${inbox.idea.unattached.length}` : ''}
                      </span>
                    ) : (
                      inbox[k].unattached.map((t) => <ItemLine key={t.id} task={t} view={view} />)
                    )}
                  </Cell>
                ))}
              </div>
            </div>
            <ArrivedShelf view={view} />
          </div>
          <DrawerSlot />
        </div>
      </div>
    </HoverProvider>
  );
}
