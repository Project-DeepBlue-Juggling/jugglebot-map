import clsx from 'clsx';
import type { CSSProperties } from 'react';
import type { Station } from '../../lib/journey';
import { NNL, tint } from '../../theme/nnl';
import { SELECTED } from './selection';

const S = NNL.status;

/** The 14 px chip the tracks AND the Key draw: done filled, now filled + halo, next amber ring, later hollow, blocked red. */
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
  let style: CSSProperties;
  let text: string = code;
  let halo = false;
  if (state === 'done') {
    style = {
      ...base,
      backgroundColor: NNL.surface,
      backgroundImage: `linear-gradient(${tint(hue, 35)}, ${tint(hue, 35)})`,
      color: NNL.textMed,
    };
    text = `✓${code.length <= 2 ? code : ''}`;
  } else if (state === 'now') {
    style = { ...base, backgroundColor: hue, color: NNL.onHue, fontWeight: 700 };
    halo = true;
  } else if (state === 'next') {
    style = { ...base, border: `2px solid ${S.next}`, color: S.next, backgroundColor: NNL.canvas };
  } else if (state === 'blocked') {
    style = { ...base, backgroundColor: S.blocked, color: '#fff' };
    text = '✕';
  } else {
    style = { ...base, border: `1.5px solid ${S.later}`, color: NNL.textLo, backgroundColor: NNL.canvas };
  }
  if (selected) style = { ...style, ...SELECTED };
  return (
    <span className="relative flex items-center justify-center">
      {halo && (
        <span className="absolute animate-pulse rounded-full" style={{ inset: -3, backgroundColor: tint(hue, 30) }} />
      )}
      <span title={title} className="relative flex items-center justify-center" style={style}>
        {text}
      </span>
    </span>
  );
}

/** The kind glyph in its kind hue: bug ■ rose, feature ● sky, idea ◇ lilac. */
export function KindGlyph({ kind, className }: { kind: string; className?: string }) {
  const k = (NNL.kind as Record<string, { hex: string; glyph: string; label: string }>)[kind];
  if (k === undefined) return null;
  return (
    <span aria-label={k.label} title={k.label} className={clsx('shrink-0', className)} style={{ color: k.hex }}>
      {k.glyph}
    </span>
  );
}

/** The `✓ n plans · m T` capsule for done plans and tickets that are not drawn. */
export function CapsuleChip({
  units,
  doneTickets,
  compact,
  title,
}: {
  units: number;
  doneTickets: number;
  compact: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      className="shrink-0 whitespace-nowrap rounded-full px-1.5 text-[10px]"
      style={{ backgroundColor: NNL.raised, color: NNL.textMed, border: `1px solid ${NNL.borderStrong}` }}
    >
      {'✓'} {units > 0 ? `${units}${compact ? '' : ` plan${units > 1 ? 's' : ''}`}` : `${doneTickets} T`}
      {units > 0 && doneTickets > 0 && !compact ? ` · ${doneTickets} T` : ''}
    </span>
  );
}

/** The 3 px bar in a Pathway's hue at the head of its block. */
export function HueBar({ hue }: { hue: string }) {
  return <i className="inline-block h-3.5 w-[3px] shrink-0" style={{ backgroundColor: hue }} />;
}

/** The hollow-circle text of a Later one-liner (the tracks and the Key both draw it). */
export function LaterMark({ text, title, style }: { text: string; title?: string; style?: CSSProperties | undefined }) {
  return (
    <span className="truncate" title={title} style={style}>
      {'○'} {text}
    </span>
  );
}
