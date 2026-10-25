import { splitTrack, type Journey, type Station } from '../../lib/journey';

/** Row heights in px; the block layout is sized from these, so the markup must use the same numbers. */
export const PITCH = 26;
export const NAME_W = 160;
export const LATER_H = 16;
export const LINE_H = 18;
export const KEY_HEAD = 24;
const TRACK_H = 22;

/** One layout of a block: how many plan tracks, whether Later stages get their own lines, and the height it needs. */
export interface Level {
  tracks: number;
  laterLines: boolean;
  h: number;
}

const trackH = (stations: readonly Station[], laterLines: boolean, compact: boolean) =>
  (compact ? 12 : 0) + TRACK_H + (laterLines ? splitTrack(stations).later.length * LATER_H : 0);

/** Richest-to-poorest layouts of a block and the height each needs. */
export function levelsOf(j: Journey, compact: boolean, nItems: number, listBelow: boolean): Level[] {
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

/**
 * Water-fill: every block starts at its richest layout; the tallest degrades one
 * level at a time until the sum fits `avail`. Returns each block's level index
 * and the free height left (negative-safe: gives up when nothing can degrade).
 */
export function fitBlocks(levels: readonly (readonly Level[])[], avail: number): { idx: number[]; free: number } {
  const idx = levels.map(() => 0);
  const heights = () => levels.map((l, i) => l[idx[i]].h);
  for (;;) {
    const hs = heights();
    if (hs.reduce((a, b) => a + b, 0) <= avail) break;
    let best = -1;
    hs.forEach((h, i) => {
      if (idx[i] < levels[i].length - 1 && (best === -1 || h > hs[best])) best = i;
    });
    if (best === -1) break;
    idx[best] += 1;
  }
  return { idx, free: avail - heights().reduce((a, b) => a + b, 0) };
}

/** Longest one-liner title drawn before an ellipsis (the full title stays in `title=`). */
export const TITLE_MAX = 85;

/** `title` cut to `max` characters with an ellipsis. */
export function clipTitle(title: string, max: number = TITLE_MAX): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

/** Room reserved after the chips for the focus stage's title. */
const FOCUS_ROOM = 180;
/** Narrowest one-liner column worth drawing beside the tracks. */
const LIST_MIN = 320;
const COLUMN_GAP = 24;

/** The one track-column width every block shares: name + the longest chip line + focus room, so all one-liners start at the same x. */
export function trackColumnWidth(journeys: readonly Journey[]): number {
  let chips = 0;
  for (const j of journeys) {
    for (const g of j.plans) chips = Math.max(chips, g.stations.length);
    chips = Math.max(chips, j.tickets.length);
  }
  return Math.min(NAME_W + 8 + chips * PITCH + 8 + FOCUS_ROOM, 620);
}

/** True when the one-liners fit beside the tracks (else the block stacks them below). */
export function listBeside(columnWidth: number, trackColW: number): boolean {
  return columnWidth === 0 || columnWidth >= trackColW + COLUMN_GAP + LIST_MIN + 24;
}
export { COLUMN_GAP };

/** Estimated rail item heights: one line 24 px, two lines 40 px (titles over ~34 chars wrap). */
export function railItemHeight(title: string): number {
  return title.length > 34 ? 40 : 24;
}

/**
 * Height cap per rail panel. `needs[i]` is panel i's content height (header
 * included). Max-min fair share: a panel needing no more than the fair share
 * keeps its need (the surplus goes to the others); the rest are capped at the
 * share and scroll inside. Empty panels (`needs[i] <= KEY_HEAD`) are never capped.
 */
export function railCaps(needs: readonly number[], available: number): number[] {
  const caps = [...needs];
  let left = available;
  let open = needs.map((_, i) => i);
  while (open.length > 0) {
    const share = left / open.length;
    const small = open.filter((i) => needs[i] <= share);
    if (small.length === 0) {
      for (const i of open) caps[i] = Math.max(share, KEY_HEAD);
      return caps;
    }
    for (const i of small) left -= needs[i];
    open = open.filter((i) => !small.includes(i));
  }
  return caps;
}
