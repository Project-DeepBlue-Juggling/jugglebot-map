// PROTOTYPE round 2: small shared React pieces for variants E, F, G (see round2.ts).
import clsx from 'clsx';
import type { Task } from '../../../api/schemas';
import { displayTitle } from '../../../lib/derive';
import { statusLabel } from '../../../theme/palette';
import { Openable } from '../../FrontPage/bits';
import type { MapView } from '../../FrontPage/mapView';
import {
  arrivedPathways,
  donePrefix,
  TOKENS,
  type Capsule,
  type InboxKind,
  type Station,
  type StationState,
} from './round2.ts';

const S = TOKENS.status;

/** One station mark (20 px box so the halo fits): done 8, now 12 + halo, next 12 amber ring, later 8 hollow grey, blocked 12 red with a white X. `square` = ticket. */
export function StationMark({
  state,
  hue,
  square = false,
  size = 20,
}: {
  state: StationState;
  hue: string;
  square?: boolean;
  /** Rendered box in px (default 20; marks scale with it). */
  size?: number;
}) {
  const shape = (d: number, props: React.SVGProps<SVGElement>) =>
    square ? (
      <rect x={10 - d / 2} y={10 - d / 2} width={d} height={d} rx={1.5} {...(props as object)} />
    ) : (
      <circle cx={10} cy={10} r={d / 2} {...(props as object)} />
    );
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
      {state === 'done' && shape(8, { fill: hue })}
      {state === 'now' && (
        <>
          {shape(20, { fill: hue, fillOpacity: 0.2 })}
          {shape(12, { fill: hue })}
        </>
      )}
      {state === 'next' && shape(10, { fill: TOKENS.canvas, stroke: S.next, strokeWidth: 2 })}
      {state === 'later' && shape(6, { fill: TOKENS.canvas, stroke: S.later, strokeWidth: 2 })}
      {state === 'blocked' && (
        <>
          {shape(12, { fill: S.blocked })}
          <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** The kind glyph in its kind hue: bug ■ rose, feature ● sky, idea ◇ lilac. */
export function KindGlyph({ kind, className }: { kind: string; className?: string }) {
  const k = (TOKENS.kind as Record<string, { hex: string; glyph: string; label: string }>)[
    kind as InboxKind
  ];
  if (k === undefined) return null;
  return (
    <span aria-label={k.label} title={k.label} className={clsx('shrink-0', className)} style={{ color: k.hex }}>
      {k.glyph}
    </span>
  );
}

const CELL_H = 34;
/** Extra px between the last station of one plan and the first of the next. */
const PLAN_GAP = 8;

/**
 * The metro line: fixed-pitch, left-aligned, bright fill over the contiguous done prefix only,
 * red dashed from a blocked station on, codes below. `capsule` draws `✓ n` before the first
 * station; `external` (a Next outside the pathway) ends the line with an amber ring and an arrow.
 */
export function Track({
  stations,
  pitch = 22,
  hue,
  view,
  capsule,
  external = null,
  showCodes = true,
  maxStations,
  dashed = false,
}: {
  stations: readonly Station[];
  /** Station spacing in px (default 22), identical for every row. */
  pitch?: number;
  hue: string;
  /** Supplies `onOpen` (click opens the drawer). */
  view: MapView;
  capsule?: Capsule;
  external?: Task | null;
  showCodes?: boolean;
  /** Show at most this many stations, then `…+n`. */
  maxStations?: number;
  /** Hue reused past 8 pathways: draw the line dashed. */
  dashed?: boolean;
}) {
  const shown = maxStations !== undefined ? stations.slice(0, maxStations) : stations;
  const hidden = stations.length - shown.length;
  const capW = capsule !== undefined && capsule.units > 0 ? 34 : 0;
  // A small extra gap where the next plan's stations begin, so repeated codes (P1, P1) read as two plans.
  const bounds: number[] = [];
  let b = 0;
  shown.forEach((s, i) => {
    if (i > 0 && s.plan?.id !== shown[i - 1].plan?.id) b += 1;
    bounds.push(b);
  });
  const xOf = (i: number) => capW + i * pitch + pitch / 2 + (i < bounds.length ? bounds[i] : b + 1) * PLAN_GAP;
  const nCells = shown.length + (external !== null ? 1 : 0);
  const width = xOf(Math.max(nCells - 1, 0)) + pitch / 2 + (hidden > 0 ? 28 : 0);
  const prefix = Math.min(donePrefix(stations), shown.length);
  const blockedAt = shown.findIndex((s) => s.state === 'blocked');
  const lineEnd = nCells > 0 ? xOf(nCells - 1) : capW;
  const fillEnd = prefix > 0 ? xOf(prefix - 1) : capW > 0 ? capW : 0;
  const lineTop = 10;
  return (
    <div className="relative shrink-0" style={{ width, height: CELL_H }} data-testid="track">
      {nCells > 0 && (
        <div
          className="absolute"
          style={{
            left: capW > 0 ? 0 : xOf(0),
            width: lineEnd - (capW > 0 ? 0 : xOf(0)),
            top: lineTop - 1,
            borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${TOKENS.border}`,
          }}
        />
      )}
      {fillEnd > 0 && (prefix > 0 || capW > 0) && (
        <div
          className="absolute"
          style={{
            left: capW > 0 ? 0 : xOf(0),
            width: fillEnd - (capW > 0 ? 0 : xOf(0)),
            top: lineTop - 1,
            borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${hue}`,
          }}
        />
      )}
      {blockedAt !== -1 && (
        <div
          className="absolute"
          style={{
            left: xOf(blockedAt),
            width: lineEnd - xOf(blockedAt),
            top: lineTop - 1,
            borderTop: `2px dashed ${S.blocked}`,
          }}
        />
      )}
      {capW > 0 && capsule !== undefined && (
        <span
          title={`${capsule.units} done, not drawn`}
          className="absolute left-0 flex items-center rounded-full px-1.5 text-[10px] font-medium"
          style={{
            top: lineTop - 8,
            height: 16,
            backgroundColor: TOKENS.raised,
            color: TOKENS.textMed,
            border: `1px solid ${TOKENS.borderStrong}`,
          }}
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
          className="absolute top-0 flex flex-col items-center rounded"
          style={{ left: xOf(i) - pitch / 2, width: pitch }}
        >
          <span title={`${displayTitle(s.task)} · ${statusLabel(s.task.status)}`} className="block">
            <StationMark state={s.state} hue={hue} square={s.isTicket} />
          </span>
          {showCodes && (
            <span className="text-[10px] leading-3" style={{ color: TOKENS.textLo }}>
              {s.code}
            </span>
          )}
        </Openable>
      ))}
      {external !== null && (
        <Openable
          id={external.id}
          view={view}
          label={displayTitle(external)}
          className="absolute top-0 flex flex-col items-center rounded"
          style={{ left: xOf(shown.length) - pitch / 2, width: pitch }}
        >
          <span title={`Next is outside this pathway: ${displayTitle(external)}`} className="block">
            <StationMark state="next" hue={hue} />
          </span>
          <span className="text-[10px] leading-3" style={{ color: S.next }}>
            ↗
          </span>
        </Openable>
      )}
      {hidden > 0 && (
        <span
          className="absolute text-[10px]"
          style={{ left: width - 28, top: lineTop - 6, color: TOKENS.textLo }}
          title={`${hidden} more stations`}
        >
          …+{hidden}
        </span>
      )}
    </div>
  );
}

/** One 24 px line of grey chips for complete pathways: `✓ name · Oct 13`; click opens. */
export function ArrivedShelf({ view }: { view: MapView }) {
  const arrived = arrivedPathways(view);
  if (arrived.length === 0) return null;
  return (
    <div data-testid="arrived" className="flex h-6 shrink-0 items-center gap-2 overflow-hidden">
      <span className="text-[10px] font-semibold uppercase" style={{ color: TOKENS.textLo }}>
        Arrived
      </span>
      {arrived.map((a) => (
        <Openable
          key={a.pathway.id}
          id={a.pathway.id}
          view={view}
          label={a.pathway.title}
          as="span"
          className="flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px]"
          style={{ backgroundColor: TOKENS.raised, color: S.complete }}
        >
          <span aria-hidden>✓</span>
          <span>{a.pathway.title}</span>
          {a.label !== '' && <span style={{ color: TOKENS.textLo }}>· {a.label}</span>}
        </Openable>
      ))}
    </div>
  );
}

/** The legend, drawn with the very marks used on the page (done, now, next, later, blocked, ticket, bug, feature, idea). */
export function Legend() {
  const h = TOKENS.textMed;
  const item = (mark: React.ReactNode, text: string) => (
    <span key={text} className="flex items-center gap-1">
      {mark}
      <span>{text}</span>
    </span>
  );
  return (
    <span
      data-testid="legend"
      className="flex items-center gap-3 text-[11px]"
      style={{ color: TOKENS.textMed }}
    >
      {item(<StationMark state="done" hue={h} size={16} />, 'done')}
      {item(<StationMark state="now" hue={h} size={16} />, 'now')}
      {item(<StationMark state="next" hue={h} size={16} />, 'next')}
      {item(<StationMark state="later" hue={h} size={16} />, 'later')}
      {item(<StationMark state="blocked" hue={h} size={16} />, 'blocked')}
      {item(<StationMark state="done" hue={h} square size={16} />, 'ticket')}
      {item(<KindGlyph kind="bug" />, 'bug')}
      {item(<KindGlyph kind="feature" />, 'feature')}
      {item(<KindGlyph kind="idea" />, 'idea')}
    </span>
  );
}
